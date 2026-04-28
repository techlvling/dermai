const express = require('express');
const { verifyAuth } = require('../middleware/auth');
const { getSupabaseAdmin } = require('../lib/supabase');

const router = express.Router();
router.use(verifyAuth);

// GET /api/reactions — list user's reactions
router.get('/api/reactions', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('reactions')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reactions: data });
});

// POST /api/reactions — upsert a reaction
router.post('/api/reactions', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { product_id, severity, notes } = req.body;

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });
  if (severity === undefined || severity === null) return res.status(400).json({ error: 'severity is required' });

  const { data, error } = await supabase
    .from('reactions')
    .upsert(
      { user_id: req.user.id, product_id, severity, notes },
      { onConflict: 'user_id,product_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reaction: data });
});

// DELETE /api/reactions/:productId — remove reaction for a product
router.delete('/api/reactions/:productId', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('user_id', req.user.id)
    .eq('product_id', req.params.productId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
