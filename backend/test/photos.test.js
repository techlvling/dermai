const request = require('supertest');
const express = require('express');
const createPhotosRouter = require('../routes/photos.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => {
  req.user = { id: 'user-123' };
  req.supabaseToken = 'tok';
  next();
};

const app = express();
app.use(express.json());
app.use(createPhotosRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('photos routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCH /api/scans/:id/images — 200 updates image_urls', async () => {
    const updated = { id: 'scan-1', user_id: 'user-123', image_urls: ['u1', 'u2', 'u3'] };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: updated, error: null }) });

    const res = await request(app)
      .patch('/api/scans/scan-1/images')
      .send({ image_urls: ['u1', 'u2', 'u3'] });
    expect(res.status).toBe(200);
    expect(res.body.scan).toEqual(updated);
  });

  it('PATCH /api/scans/:id/images — 400 when image_urls missing', async () => {
    const res = await request(app).patch('/api/scans/scan-1/images').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_urls/);
  });

  it('GET /api/progress-photos — 200 returns list', async () => {
    const photos = [{ id: '1', user_id: 'user-123', photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: photos, error: null }) });

    const res = await request(app).get('/api/progress-photos');
    expect(res.status).toBe(200);
    expect(res.body.photos).toEqual(photos);
  });

  it('POST /api/progress-photos — 200 upserts', async () => {
    const saved = { id: '1', user_id: 'user-123', photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app)
      .post('/api/progress-photos')
      .send({ photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' });
    expect(res.status).toBe(200);
    expect(res.body.photo).toEqual(saved);
  });

  it('POST /api/progress-photos — 400 when photo_date missing', async () => {
    const res = await request(app)
      .post('/api/progress-photos')
      .send({ drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photo_date/);
  });

  it('DELETE /api/progress-photos/:date — 200 on success', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [], error: null }) });

    const res = await request(app).delete('/api/progress-photos/2026-04-29');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
