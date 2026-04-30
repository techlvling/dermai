const express = require('express');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function createDiaryRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // GET /api/diary?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Defaults: last 30 days through today (matches the existing 14-day chart
  // and leaves headroom for the weekly summary card in Phase 6).
  router.get('/api/diary', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const fromDate = DATE_RE.test(req.query.from) ? req.query.from : defaultFrom.toISOString().slice(0, 10);
    const toDate   = DATE_RE.test(req.query.to)   ? req.query.to   : today.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('diary_entries')
      .select('log_date, water_liters, stress_1_5, sleep_hours, mood, notes')
      .eq('user_id', req.user.id)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ entries: data });
  });

  // POST /api/diary — upsert a day's entry
  // Body: { log_date, water_liters?, stress_1_5?, sleep_hours?, mood?, notes? }
  router.post('/api/diary', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { log_date, water_liters, stress_1_5, sleep_hours, mood, notes } = req.body || {};

    if (!DATE_RE.test(log_date)) {
      return res.status(400).json({ error: 'log_date is required (YYYY-MM-DD)' });
    }
    if (water_liters != null && (typeof water_liters !== 'number' || water_liters < 0 || water_liters > 10)) {
      return res.status(400).json({ error: 'water_liters must be 0–10' });
    }
    if (stress_1_5 != null && (!Number.isInteger(stress_1_5) || stress_1_5 < 1 || stress_1_5 > 5)) {
      return res.status(400).json({ error: 'stress_1_5 must be an integer 1–5' });
    }
    if (sleep_hours != null && (typeof sleep_hours !== 'number' || sleep_hours < 0 || sleep_hours > 24)) {
      return res.status(400).json({ error: 'sleep_hours must be 0–24' });
    }

    // Build a row containing only the fields the client sent so partial
    // upserts don't clobber columns the user hasn't touched today.
    const row = { user_id: req.user.id, log_date };
    if (water_liters != null) row.water_liters = water_liters;
    if (stress_1_5   != null) row.stress_1_5   = stress_1_5;
    if (sleep_hours  != null) row.sleep_hours  = sleep_hours;
    if (mood  != null)        row.mood         = mood;
    if (notes != null)        row.notes        = notes;

    const { data, error } = await supabase
      .from('diary_entries')
      .upsert(row, { onConflict: 'user_id,log_date', ignoreDuplicates: false })
      .select('log_date, water_liters, stress_1_5, sleep_hours, mood, notes')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ entry: data });
  });

  return router;
}

module.exports = createDiaryRouter;
