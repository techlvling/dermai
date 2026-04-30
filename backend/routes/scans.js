const express = require('express');

function createScansRouter(verifyAuth, getSupabaseAdmin) {
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
  // Returns the inserted row plus a day_index = days since the user's
  // EARLIEST scan (so day_index is 0 for the very first scan, increments
  // by elapsed days for subsequent scans regardless of how many were taken
  // in between). Frontend uses this to build the "Day N - YYYY-MM-DD"
  // Drive folder for cross-scan progress comparison.
  router.post('/api/scans', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { result_json, image_urls } = req.body;

    if (!result_json) return res.status(400).json({ error: 'result_json is required' });

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

    // Compute day_index by comparing the new scan's created_at to the
    // user's earliest scan. The earliest is the new one itself when this
    // is the first scan ever — that case produces day_index = 0.
    let day_index = 0;
    try {
      const { data: minRow } = await supabase
        .from('scans')
        .select('created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (minRow?.created_at) {
        const ms = new Date(data.created_at).getTime() - new Date(minRow.created_at).getTime();
        day_index = Math.max(0, Math.floor(ms / 86400000));
      }
    } catch (_) { /* best-effort; default to 0 */ }

    res.json({ scan: data, day_index });
  });

  // DELETE /api/scans/:id — delete a scan by id
  router.delete('/api/scans/:id', async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data, error } = await supabase
      .from('scans').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Scan not found' });
    res.json({ success: true });
  });

  return router;
}

module.exports = createScansRouter;
