const request = require('supertest');
const express = require('express');
const createReactionsRouter = require('../routes/reactions.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createReactionsRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('reactions routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/reactions — 200 returns reactions list', async () => {
    const reactions = [{ id: '1', user_id: 'user-123', product_id: 'retinol', severity: 2 }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: reactions, error: null }) });

    const res = await request(app).get('/api/reactions');
    expect(res.status).toBe(200);
    expect(res.body.reactions).toEqual(reactions);
  });

  it('POST /api/reactions — 200 upserts reaction', async () => {
    const saved = { id: '2', user_id: 'user-123', product_id: 'retinol', severity: 3, notes: 'stings' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app)
      .post('/api/reactions')
      .send({ product_id: 'retinol', severity: 3, notes: 'stings' });
    expect(res.status).toBe(200);
    expect(res.body.reaction).toEqual(saved);
  });

  it('POST /api/reactions — 400 when product_id is missing', async () => {
    const res = await request(app).post('/api/reactions').send({ severity: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/product_id/);
  });

  it('POST /api/reactions — 400 when severity is missing', async () => {
    const res = await request(app).post('/api/reactions').send({ product_id: 'retinol' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/severity/);
  });

  it('DELETE /api/reactions/:productId — 200 on success', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [], error: null }) });

    const res = await request(app).delete('/api/reactions/retinol');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
