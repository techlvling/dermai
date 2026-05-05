const { Router } = require('express');
const { getSupabaseAdmin } = require('../../lib/supabase');

const router = Router();

// GET /api/admin/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [totalUsersRes, recentScansRes, todayScansRes, reactionAlertRes, evidenceRes] = await Promise.all([
      // total users via auth.admin (just get page 1 to get total)
      supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
      // scans over the last N days, grouped by date
      supabase.from('scans').select('created_at', { count: 'exact' }).gte('created_at', since),
      // today's scans
      supabase.from('scans').select('id', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00Z'),
      // severity 4-5 reactions total
      supabase.from('reactions').select('id', { count: 'exact', head: true }).gte('severity', 4),
      // evidence cache
      supabase.from('evidence_cache').select('last_refreshed').eq('id', 'singleton').maybeSingle(),
    ]);

    // Build scans-per-day histogram
    const scansByDay = {};
    (recentScansRes.data || []).forEach(s => {
      const day = s.created_at.slice(0, 10);
      scansByDay[day] = (scansByDay[day] || 0) + 1;
    });

    res.json({
      total_users:         totalUsersRes.data?.total ?? 0,
      today_scans:         todayScansRes.count ?? 0,
      total_scans_period:  recentScansRes.count ?? 0,
      reaction_alerts:     reactionAlertRes.count ?? 0,
      evidence_last_refreshed: evidenceRes.data?.last_refreshed || null,
      scans_by_day:        scansByDay,
    });
  } catch (err) {
    console.error('[admin/analytics] GET /overview', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
