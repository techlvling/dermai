const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/scans?user_id=&from=&to=&limit=50&page=1
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('scans')
      .select('id, user_id, created_at, image_urls, closeup_meta', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.user_id) query = query.eq('user_id', req.query.user_id);
    if (req.query.from)    query = query.gte('created_at', req.query.from);
    if (req.query.to)      query = query.lte('created_at', req.query.to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ scans: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[admin/scans] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/scans/:id
router.get('/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[admin/scans] GET /:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/scans/:id
router.delete('/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('scans').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/scans] DELETE /:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
