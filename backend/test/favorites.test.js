const request = require('supertest');
const express = require('express');
const createFavoritesRouter = require('../routes/favorites.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createFavoritesRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('favorites routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/favorites — 200 returns favorites list', async () => {
    const favorites = [{ id: '1', user_id: 'user-123', product_id: 'retinol-serum' }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: favorites, error: null }) });

    const res = await request(app).get('/api/favorites');
    expect(res.status).toBe(200);
    expect(res.body.favorites).toEqual(favorites);
  });

  it('POST /api/favorites — 200 saves favorite', async () => {
    const saved = { id: '2', user_id: 'user-123', product_id: 'niacinamide' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app).post('/api/favorites').send({ product_id: 'niacinamide' });
    expect(res.status).toBe(200);
    expect(res.body.favorite).toEqual(saved);
  });

  it('POST /api/favorites — 400 when product_id is missing', async () => {
    const res = await request(app).post('/api/favorites').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/product_id/);
  });

  it('DELETE /api/favorites/:productId — 200 on success', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [], error: null }) });

    const res = await request(app).delete('/api/favorites/retinol-serum');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
