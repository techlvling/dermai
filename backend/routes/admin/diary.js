const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/diary?has_symptoms=true&limit=50&page=1
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
    const page   = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('diary_entries')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.has_symptoms === 'true') {
      query = query.not('symptoms', 'eq', '{}').not('symptoms', 'is', null);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ entries: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[admin/diary] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
