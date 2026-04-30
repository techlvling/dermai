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
      .select('log_date, steps_done, slot_choices')
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

    const { log_date, steps_done, am_done, pm_done, slot_choices } = req.body || {};

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

    const row = { user_id: req.user.id, log_date, steps_done: payload };

    // slot_choices is optional. New shape: { am:{step:[{source,id},...]}, pm:{...} }
    // Legacy shape: { am:{step:{source,id}}, pm:{...} } — accepted on write and
    // normalized to a 1-element array so the on-disk JSON is consistent.
    if (slot_choices !== undefined) {
      if (typeof slot_choices !== 'object' || slot_choices === null || Array.isArray(slot_choices)) {
        return res.status(400).json({ error: 'slot_choices must be an object' });
      }
      const normalized = {};
      const isValidChoice = (c) =>
        c && typeof c === 'object' && !Array.isArray(c)
        && (c.source === 'catalog' || c.source === 'user')
        && typeof c.id === 'string' && c.id.length > 0;

      for (const slot of ['am', 'pm']) {
        if (slot_choices[slot] == null) continue;
        if (typeof slot_choices[slot] !== 'object' || Array.isArray(slot_choices[slot])) {
          return res.status(400).json({ error: `slot_choices.${slot} must be an object` });
        }
        normalized[slot] = {};
        for (const [step, value] of Object.entries(slot_choices[slot])) {
          if (value == null) continue;
          // Accept either a single choice object (legacy) or an array of them.
          const choices = Array.isArray(value) ? value : [value];
          for (const c of choices) {
            if (!isValidChoice(c)) {
              return res.status(400).json({
                error: `slot_choices.${slot}.${step} entries must be { source: 'catalog'|'user', id: string }`
              });
            }
          }
          normalized[slot][step] = choices;
        }
      }
      row.slot_choices = normalized;
    }

    const { data, error } = await supabase
      .from('routine_logs')
      .upsert(row, { onConflict: 'user_id,log_date' })
      .select('log_date, steps_done, slot_choices')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ log: data });
  });

  return router;
}

module.exports = createRoutineRouter;
