const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/users?q=&limit=50&page=1
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);

    // List users via service-role auth admin API
    const { data, error } = await supabase.auth.admin.listUsers({
      page, perPage: limit
    });
    if (error) throw error;

    const users = data.users;

    // If search query provided, filter client-side (small dataset)
    const q = (req.query.q || '').toLowerCase();
    const filtered = q
      ? users.filter(u =>
          u.email?.toLowerCase().includes(q) ||
          u.user_metadata?.full_name?.toLowerCase().includes(q)
        )
      : users;

    // Get scan + reaction counts for each user in one query
    const ids = filtered.map(u => u.id);
    const [scanRes, reactionRes] = await Promise.all([
      supabase.from('scans').select('user_id', { count: 'exact', head: false })
        .in('user_id', ids),
      supabase.from('reactions').select('user_id', { count: 'exact', head: false })
        .in('user_id', ids),
    ]);

    const scanCounts     = {};
    const reactionCounts = {};
    (scanRes.data     || []).forEach(r => { scanCounts[r.user_id]     = (scanCounts[r.user_id]     || 0) + 1; });
    (reactionRes.data || []).forEach(r => { reactionCounts[r.user_id] = (reactionCounts[r.user_id] || 0) + 1; });

    const result = filtered.map(u => ({
      id:             u.id,
      email:          u.email,
      display_name:   u.user_metadata?.full_name || null,
      avatar_url:     u.user_metadata?.avatar_url || null,
      created_at:     u.created_at,
      last_sign_in:   u.last_sign_in_at,
      scan_count:     scanCounts[u.id]     || 0,
      reaction_count: reactionCounts[u.id] || 0,
    }));

    res.json({ users: result, total: data.total ?? filtered.length, page, limit });
  } catch (err) {
    console.error('[admin/users] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id
router.get('/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = req.params;

    const [userRes, scansRes, reactionsRes, diaryRes] = await Promise.all([
      supabase.auth.admin.getUserById(id),
      supabase.from('scans').select('id, created_at, result_json, image_urls').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('reactions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('diary_entries').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
    ]);

    if (userRes.error) throw userRes.error;

    const u = userRes.data.user;
    res.json({
      id:           u.id,
      email:        u.email,
      display_name: u.user_metadata?.full_name || null,
      avatar_url:   u.user_metadata?.avatar_url || null,
      created_at:   u.created_at,
      last_sign_in: u.last_sign_in_at,
      scans:        scansRes.data   || [],
      reactions:    reactionsRes.data || [],
      diary:        diaryRes.data   || [],
    });
  } catch (err) {
    console.error('[admin/users] GET /:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users] DELETE /:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
