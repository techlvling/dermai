const request = require('supertest');
const express = require('express');
const createUserProductsRouter = require('../routes/userProducts.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createUserProductsRouter(mockVerifyAuth, mockGetSupabaseAdmin));

// Error handler
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const VALID_BODY = {
  name: 'CeraVe Foaming Cleanser',
  brand: 'CeraVe',
  category: 'cleanser',
  best_time_of_day: 'both',
  ingredients: ['niacinamide', 'ceramides'],
};

describe('GET /api/user-products', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 returns the current user\'s products', async () => {
    const products = [
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Mine', brand: null, category: 'cleanser', best_time_of_day: 'AM', ingredients: [], created_at: '2026-04-30T00:00:00Z' },
    ];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: products, error: null }) });

    const res = await request(app).get('/api/user-products');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual(products);
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const res = await request(app).get('/api/user-products');
    expect(res.status).toBe(503);
  });
});

describe('POST /api/user-products', () => {
  beforeEach(() => vi.clearAllMocks());

  it('201 inserts a valid product', async () => {
    const saved = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ...VALID_BODY, created_at: '2026-04-30T00:00:00Z' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app).post('/api/user-products').send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.product).toEqual(saved);
  });

  it('400 when name is missing', async () => {
    const res = await request(app).post('/api/user-products').send({ ...VALID_BODY, name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('400 when category is invalid', async () => {
    const res = await request(app).post('/api/user-products').send({ ...VALID_BODY, category: 'serum' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/);
  });

  it('400 when best_time_of_day is invalid', async () => {
    const res = await request(app).post('/api/user-products').send({ ...VALID_BODY, best_time_of_day: 'midnight' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/best_time_of_day/);
  });

  it('400 when ingredients contains a non-string', async () => {
    const res = await request(app).post('/api/user-products').send({ ...VALID_BODY, ingredients: ['niacinamide', 42] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ingredients/);
  });

  it('accepts missing brand and missing ingredients (defaults)', async () => {
    const minimal = { name: 'Minimal', category: 'moisturizer', best_time_of_day: 'PM' };
    const saved = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', ...minimal, brand: null, ingredients: [], created_at: '2026-04-30T00:00:00Z' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app).post('/api/user-products').send(minimal);
    expect(res.status).toBe(201);
    expect(res.body.product.brand).toBeNull();
    expect(res.body.product.ingredients).toEqual([]);
  });
});

describe('DELETE /api/user-products/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('204 on successful delete', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: null }) });
    const res = await request(app).delete('/api/user-products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(204);
  });

  it('400 when id is not a UUID', async () => {
    const res = await request(app).delete('/api/user-products/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid id/);
  });

  it('500 when supabase returns an error', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: { message: 'boom' } }) });
    const res = await request(app).delete('/api/user-products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
  });
});
