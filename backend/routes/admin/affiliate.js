const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/affiliate/regions
router.get('/regions', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('affiliate_regions')
      .select('*')
      .order('country_code');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[admin/affiliate] GET /regions', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/affiliate/regions/:code
router.patch('/regions/:code', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { tag } = req.body;
    if (typeof tag !== 'string') {
      return res.status(400).json({ error: '`tag` string required' });
    }
    const { data, error } = await supabase
      .from('affiliate_regions')
      .update({ tag, updated_at: new Date().toISOString() })
      .eq('country_code', req.params.code.toUpperCase())
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[admin/affiliate] PATCH /regions/:code', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
