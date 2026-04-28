const express = require('express');
const { verifyAuth } = require('../middleware/auth');
const { getSupabaseAdmin } = require('../lib/supabase');

const router = express.Router();
router.use(verifyAuth);

// GET /api/scans — list user's scans (newest first, limit 50)
router.get('/api/scans', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ scans: data });
});

// POST /api/scans — save a scan result
router.post('/api/scans', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { result_json, image_urls } = req.body;

  const { data, error } = await supabase
    .from('scans')
    .insert({
      user_id: req.user.id,
      result_json,
      image_urls: image_urls || null
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ scan: data });
});

// DELETE /api/scans/:id — delete a scan by id
router.delete('/api/scans/:id', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { error } = await supabase
    .from('scans')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
