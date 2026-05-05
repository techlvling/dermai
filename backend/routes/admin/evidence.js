const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/evidence — evidence cache status
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('evidence_cache')
      .select('last_refreshed, ingredients')
      .eq('id', 'singleton')
      .maybeSingle();
    if (error) throw error;

    const ingredientCount = Array.isArray(data?.ingredients) ? data.ingredients.length : 0;
    res.json({
      last_refreshed:    data?.last_refreshed || null,
      ingredient_count:  ingredientCount,
      status:            data ? 'ok' : 'empty',
    });
  } catch (err) {
    console.error('[admin/evidence] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/evidence/refresh — manually trigger cron
router.post('/refresh', async (req, res) => {
  try {
    // Reuse the same handler exported by routes/cron.js
    const cronHandler = require('../cron').refreshEvidence;
    if (!cronHandler) {
      return res.status(501).json({ error: 'refreshEvidence not exported from cron.js yet' });
    }
    await cronHandler(getSupabaseAdmin());
    res.json({ ok: true, triggered_at: new Date().toISOString() });
  } catch (err) {
    console.error('[admin/evidence] POST /refresh', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
