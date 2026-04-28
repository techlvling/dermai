const express = require('express');
const { verifyAuth } = require('../middleware/auth');
const { getSupabaseAdmin } = require('../lib/supabase');

const router = express.Router();
router.use(verifyAuth);

// GET /api/favorites — list user's favorites
router.get('/api/favorites', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: data });
});

// POST /api/favorites — save a favorite (upsert: insert if not exists)
router.post('/api/favorites', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { product_id } = req.body;

  const { data, error } = await supabase
    .from('favorites')
    .upsert({ user_id: req.user.id, product_id }, { onConflict: 'user_id,product_id', ignoreDuplicates: true })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorite: data });
});

// DELETE /api/favorites/:productId — remove a favorite by product_id
router.delete('/api/favorites/:productId', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', req.user.id)
    .eq('product_id', req.params.productId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
