const express = require('express');
const { verifyAuth } = require('../middleware/auth');
const { getSupabaseAdmin } = require('../lib/supabase');

const router = express.Router();
router.use(verifyAuth);

// GET /api/routine — get routine logs (last 90 days)
router.get('/api/routine', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('routine_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('log_date', cutoffDate)
    .order('log_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ logs: data });
});

// POST /api/routine — upsert a day's log
router.post('/api/routine', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { log_date, am_done, pm_done } = req.body;

  if (!log_date) return res.status(400).json({ error: 'log_date is required' });

  const { data, error } = await supabase
    .from('routine_logs')
    .upsert(
      { user_id: req.user.id, log_date, am_done, pm_done },
      { onConflict: 'user_id,log_date' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ log: data });
});

module.exports = router;
