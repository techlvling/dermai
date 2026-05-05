const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/reactions?severity_min=1&user_id=&limit=50&page=1
// Default: severity_min=4 to surface the safety queue
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const limit      = Math.min(parseInt(req.query.limit) || 50, 100);
    const page       = Math.max(parseInt(req.query.page) || 1, 1);
    const offset     = (page - 1) * limit;
    const severityMin = parseInt(req.query.severity_min) || 4;

    let query = supabase
      .from('reactions')
      .select('*', { count: 'exact' })
      .gte('severity', severityMin)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.user_id) query = query.eq('user_id', req.query.user_id);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ reactions: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[admin/reactions] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/reactions/:id
router.get('/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('reactions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[admin/reactions] GET /:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
