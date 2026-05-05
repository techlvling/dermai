const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/ai-usage?from=2026-01-01&to=2026-12-31
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const from = req.query.from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('ai_usage_log')
      .select('ts, route, provider, model, prompt_tokens, completion_tokens, status, error')
      .gte('ts', from)
      .lte('ts', to + 'T23:59:59Z')
      .order('ts', { ascending: false });

    if (error) throw error;

    // Daily aggregates by provider
    const byDay = {};
    (data || []).forEach(row => {
      const day = row.ts.slice(0, 10);
      if (!byDay[day]) byDay[day] = {};
      const prov = row.provider || 'unknown';
      if (!byDay[day][prov]) byDay[day][prov] = { calls: 0, prompt_tokens: 0, completion_tokens: 0, errors: 0 };
      byDay[day][prov].calls++;
      byDay[day][prov].prompt_tokens     += row.prompt_tokens     || 0;
      byDay[day][prov].completion_tokens += row.completion_tokens || 0;
      if (row.status === 'error') byDay[day][prov].errors++;
    });

    const failures = (data || []).filter(r => r.status === 'error').slice(0, 20);

    res.json({ by_day: byDay, failures, total: (data || []).length });
  } catch (err) {
    console.error('[admin/ai-usage] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
