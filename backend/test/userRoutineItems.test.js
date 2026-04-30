const request = require('supertest');
const express = require('express');
const createUserRoutineItemsRouter = require('../routes/userRoutineItems.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createUserRoutineItemsRouter(mockVerifyAuth, mockGetSupabaseAdmin));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

// Use a real catalog id from data/products.json for the validation path
const VALID_BODY = {
  product_id: 'prod_tret_01', // Adaferin — exists in catalog
  slot: 'treatment',
  time_of_day: 'PM',
};

describe('GET /api/routine-items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 returns the user\'s items', async () => {
    const items = [
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', product_id: 'prod_tret_01', slot: 'treatment', time_of_day: 'PM', order_index: 0, added_at: '2026-05-01T00:00:00Z' },
    ];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: items, error: null }) });

    const res = await request(app).get('/api/routine-items');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(items);
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const res = await request(app).get('/api/routine-items');
    expect(res.status).toBe(503);
  });
});

describe('POST /api/routine-items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('201 inserts a valid item', async () => {
    const saved = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ...VALID_BODY, order_index: 0, added_at: '2026-05-01T00:00:00Z' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app).post('/api/routine-items').send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.item.product_id).toBe('prod_tret_01');
    expect(res.body.item.slot).toBe('treatment');
  });

  it('400 when product_id is missing', async () => {
    const res = await request(app).post('/api/routine-items').send({ ...VALID_BODY, product_id: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/product_id/);
  });

  it('400 when product_id is not in catalog', async () => {
    const res = await request(app).post('/api/routine-items').send({ ...VALID_BODY, product_id: 'prod_does_not_exist' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });

  it('400 when slot is invalid', async () => {
    const res = await request(app).post('/api/routine-items').send({ ...VALID_BODY, slot: 'serum' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slot/);
  });

  it('400 when time_of_day is invalid', async () => {
    const res = await request(app).post('/api/routine-items').send({ ...VALID_BODY, time_of_day: 'midnight' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/time_of_day/);
  });
});

describe('DELETE /api/routine-items/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('204 on success', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: null }) });
    const res = await request(app).delete('/api/routine-items/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(204);
  });

  it('400 when id is not a UUID', async () => {
    const res = await request(app).delete('/api/routine-items/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid id/);
  });

  it('500 on supabase error', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: { message: 'boom' } }) });
    const res = await request(app).delete('/api/routine-items/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(500);
  });
});
