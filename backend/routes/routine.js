const express = require('express');

function createRoutineRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // GET /api/routine?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Defaults: last 365 days through today (year heatmap needs this range).
  router.get('/api/routine', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 365);

    const fromDate = (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from))
      ? req.query.from
      : defaultFrom.toISOString().slice(0, 10);
    const toDate = (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to))
      ? req.query.to
      : today.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('routine_logs')
      .select('log_date, steps_done')
      .eq('user_id', req.user.id)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ logs: data });
  });

  // POST /api/routine — upsert a day's log
  // Accepts: { log_date, steps_done: { am: { cleanser: bool, ... }, pm: {...} } }
  // Backwards-compat: { log_date, am_done, pm_done } is folded into a coarse
  // { am: { any: bool }, pm: { any: bool } } shape so the legacy migration.js
  // payload still works during rollout.
  router.post('/api/routine', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { log_date, steps_done, am_done, pm_done } = req.body || {};

    if (!log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
      return res.status(400).json({ error: 'log_date is required (YYYY-MM-DD)' });
    }

    let payload = steps_done;
    if (payload == null) {
      // Legacy shape — translate to the new bucket form
      payload = {
        am: am_done ? { any: true } : {},
        pm: pm_done ? { any: true } : {},
      };
    }

    if (typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'steps_done must be an object' });
    }

    const { data, error } = await supabase
      .from('routine_logs')
      .upsert(
        { user_id: req.user.id, log_date, steps_done: payload },
        { onConflict: 'user_id,log_date' }
      )
      .select('log_date, steps_done')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ log: data });
  });

  return router;
}

module.exports = createRoutineRouter;
