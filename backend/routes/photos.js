const express = require('express');

function createPhotosRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // PATCH /api/scans/:id/images
  router.patch('/api/scans/:id/images', async (req, res) => {
    const { image_urls } = req.body;
    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return res.status(400).json({ error: 'image_urls array is required' });
    }
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await db
      .from('scans')
      .update({ image_urls })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Scan not found' });
    return res.json({ scan: data[0] });
  });

  // PATCH /api/scans/:id/closeup-meta
  // Persists user-flagged close-up photo URLs + notes for a scan. Optional —
  // omitting this leaves closeup_meta NULL on the row.
  router.patch('/api/scans/:id/closeup-meta', async (req, res) => {
    const { closeup_meta } = req.body;
    if (!Array.isArray(closeup_meta)) {
      return res.status(400).json({ error: 'closeup_meta must be an array' });
    }
    if (closeup_meta.length > 3) {
      return res.status(400).json({ error: 'closeup_meta cannot have more than 3 entries' });
    }
    let cleaned;
    try {
      cleaned = closeup_meta.map((entry, i) => {
        if (!entry || typeof entry !== 'object') {
          throw Object.assign(new Error(`closeup_meta[${i}] must be an object`), { status: 400 });
        }
        const url = typeof entry.url === 'string' ? entry.url.slice(0, 1000) : null;
        const note = typeof entry.note === 'string' ? entry.note.slice(0, 200) : '';
        if (!url) {
          throw Object.assign(new Error(`closeup_meta[${i}].url is required`), { status: 400 });
        }
        return { url, note };
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await db
      .from('scans')
      .update({ closeup_meta: cleaned.length ? cleaned : null })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Scan not found' });
    return res.json({ scan: data[0] });
  });

  // GET /api/progress-photos
  router.get('/api/progress-photos', async (req, res) => {
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await db
      .from('progress_photos')
      .select('*')
      .eq('user_id', req.user.id)
      .order('photo_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ photos: data });
  });

  // POST /api/progress-photos
  router.post('/api/progress-photos', async (req, res) => {
    const { photo_date, drive_file_id, drive_url } = req.body;
    if (!photo_date) return res.status(400).json({ error: 'photo_date is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(photo_date)) {
      return res.status(400).json({ error: 'photo_date must be YYYY-MM-DD' });
    }
    if (!drive_file_id) return res.status(400).json({ error: 'drive_file_id is required' });
    if (!drive_url) return res.status(400).json({ error: 'drive_url is required' });
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { data, error } = await db
      .from('progress_photos')
      .upsert(
        { user_id: req.user.id, photo_date, drive_file_id, drive_url },
        { onConflict: 'user_id,photo_date' }
      )
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ photo: data });
  });

  // DELETE /api/progress-photos/:date
  router.delete('/api/progress-photos/:date', async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { error } = await db
      .from('progress_photos')
      .delete()
      .eq('user_id', req.user.id)
      .eq('photo_date', req.params.date);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  });

  return router;
}

module.exports = createPhotosRouter;
