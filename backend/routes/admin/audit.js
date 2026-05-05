const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/audit — last 200 admin actions
router.get('/', async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('ts', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) {
    console.error('[admin/audit] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
