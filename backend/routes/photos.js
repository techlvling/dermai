const express = require('express');

function createPhotosRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // PATCH /api/scans/:id/images
  router.patch('/api/scans/:id/images', async (req, res) => {
    const { image_urls } = req.body;
    if (!image_urls || !Array.isArray(image_urls)) {
      return res.status(400).json({ error: 'image_urls array is required' });
    }
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('scans')
      .update({ image_urls })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ scan: data });
  });

  // GET /api/progress-photos
  router.get('/api/progress-photos', async (req, res) => {
    const db = getSupabaseAdmin();
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
    if (!drive_file_id) return res.status(400).json({ error: 'drive_file_id is required' });
    if (!drive_url) return res.status(400).json({ error: 'drive_url is required' });
    const db = getSupabaseAdmin();
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
    const db = getSupabaseAdmin();
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
