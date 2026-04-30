const request = require('supertest');
const express = require('express');
const createProductEvaluationsRouter = require('../routes/productEvaluations.js');
const {
  parseIngredientsText,
  buildIngredientIndex,
  matchIngredient,
  computeCacheKey,
  extractJSON,
} = require('../routes/productEvaluations.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockGetClient = vi.fn();
const mockGetGroqClient = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createProductEvaluationsRouter(mockVerifyAuth, mockGetSupabaseAdmin, mockGetClient, mockGetGroqClient));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

const FAKE_EVAL = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  key: 'abc123',
  name: 'Test Cream',
  brand: 'TestBrand',
  ingredients: ['niacinamide'],
  unmapped_ingredients: [],
  category: 'moisturizer',
  best_time_of_day: 'both',
  verdict_json: { score: 7, summary: 'Good basics.' },
  model: 'mock',
  created_at: '2026-04-30T00:00:00Z',
  evaluated_at: '2026-04-30T00:00:00Z',
};

const VALID_BODY = {
  name: 'Test Cream',
  brand: 'TestBrand',
  raw_ingredients_text: 'niacinamide, glycerin, water',
};

// ── Pure helpers ──────────────────────────────────────────────────────────

describe('parseIngredientsText', () => {
  it('splits commas, semicolons, and newlines, drops parens, trims', () => {
    expect(parseIngredientsText('Niacinamide (5%); Glycerin\nWater')).toEqual(['niacinamide', 'glycerin', 'water']);
  });
  it('returns empty array on null', () => {
    expect(parseIngredientsText(null)).toEqual([]);
  });
  it('caps at 50 tokens', () => {
    const tokens = Array.from({ length: 70 }, (_, i) => `ing${i}`).join(',');
    expect(parseIngredientsText(tokens)).toHaveLength(50);
  });
});

describe('matchIngredient', () => {
  const idx = buildIngredientIndex([
    { id: 'niacinamide', name: 'Niacinamide' },
    { id: 'salicylic_acid', name: 'Salicylic Acid' },
    { id: 'hyaluronic_acid', name: 'Hyaluronic Acid' },
  ]);
  it('matches by canonical id', () => {
    expect(matchIngredient('niacinamide', idx)).toBe('niacinamide');
  });
  it('matches by display name (case-insensitive)', () => {
    expect(matchIngredient('Salicylic Acid', idx)).toBe('salicylic_acid');
  });
  it('matches by underscored display name', () => {
    expect(matchIngredient('hyaluronic_acid', idx)).toBe('hyaluronic_acid');
  });
  it('returns null for unknown', () => {
    expect(matchIngredient('definitely-not-real', idx)).toBeNull();
  });
});

describe('computeCacheKey', () => {
  it('is deterministic regardless of ingredient order', () => {
    const k1 = computeCacheKey('A', 'B', ['x', 'y', 'z']);
    const k2 = computeCacheKey('A', 'B', ['z', 'y', 'x']);
    expect(k1).toBe(k2);
  });
  it('is case-insensitive on brand and name', () => {
    expect(computeCacheKey('CeraVe', 'Cleanser', ['x'])).toBe(computeCacheKey('CERAVE', 'cleanser', ['x']));
  });
  it('returns 16-char hex', () => {
    expect(computeCacheKey('a', 'b', [])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('extractJSON', () => {
  it('strips ```json fences', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('finds the JSON block in surrounding prose', () => {
    expect(extractJSON('Here is your verdict: {"score":7} done.')).toEqual({ score: 7 });
  });
  it('returns null on malformed JSON', () => {
    expect(extractJSON('{not json}')).toBeNull();
  });
});

// ── POST /api/evaluate-product ────────────────────────────────────────────

describe('POST /api/evaluate-product', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 when name is missing', async () => {
    const res = await request(app).post('/api/evaluate-product').send({ raw_ingredients_text: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('400 when raw_ingredients_text is missing', async () => {
    const res = await request(app).post('/api/evaluate-product').send({ name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/raw_ingredients_text/);
  });

  it('400 when category is invalid', async () => {
    const res = await request(app).post('/api/evaluate-product').send({ ...VALID_BODY, category: 'serum' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/);
  });

  it('cache hit returns existing evaluation without calling AI', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: FAKE_EVAL, error: null }) });
    const aiCreate = vi.fn();
    mockGetClient.mockReturnValue({ chat: { completions: { create: aiCreate } } });

    const res = await request(app).post('/api/evaluate-product').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.fromCache).toBe(true);
    expect(res.body.evaluation.id).toBe(FAKE_EVAL.id);
    expect(aiCreate).not.toHaveBeenCalled();
  });

  it('cache miss → AI is called → row is inserted → returns verdict', async () => {
    // First chain call (lookup) returns null; second chain call (insert) returns FAKE_EVAL.
    let callIdx = 0;
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => {
        const result = callIdx === 0
          ? { data: null, error: null }
          : { data: { ...FAKE_EVAL }, error: null };
        callIdx++;
        return makeChain(result);
      },
    });
    const aiCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"score":7,"summary":"Good basics.","recommended_slot":{"key":"moisturizer","time":"both"},"conflicts":[],"evidence_notes":[]}' } }],
    });
    mockGetClient.mockReturnValue({ chat: { completions: { create: aiCreate } } });

    const res = await request(app).post('/api/evaluate-product').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.fromCache).toBe(false);
    expect(aiCreate).toHaveBeenCalledOnce();
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const res = await request(app).post('/api/evaluate-product').send(VALID_BODY);
    expect(res.status).toBe(503);
  });
});

// ── POST /api/user-products/from-evaluation ───────────────────────────────

describe('POST /api/user-products/from-evaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 when evaluation_id is missing', async () => {
    const res = await request(app).post('/api/user-products/from-evaluation').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/evaluation_id/);
  });

  it('404 when evaluation does not exist', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: null }) });
    const res = await request(app).post('/api/user-products/from-evaluation').send({ evaluation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    expect(res.status).toBe(404);
  });

  it('201 inserts a user_products row from the evaluation', async () => {
    let callIdx = 0;
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => {
        // First call: select evaluation → return FAKE_EVAL
        // Second call: insert into user_products → return saved row
        const result = callIdx === 0
          ? { data: FAKE_EVAL, error: null }
          : { data: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: FAKE_EVAL.name, brand: FAKE_EVAL.brand, category: FAKE_EVAL.category, best_time_of_day: FAKE_EVAL.best_time_of_day, ingredients: FAKE_EVAL.ingredients, source_url: 'https://example.com', evaluation_id: FAKE_EVAL.id, created_at: '2026-04-30T00:00:00Z' }, error: null };
        callIdx++;
        return makeChain(result);
      },
    });

    const res = await request(app)
      .post('/api/user-products/from-evaluation')
      .send({ evaluation_id: FAKE_EVAL.id, source_url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(res.body.product.evaluation_id).toBe(FAKE_EVAL.id);
    expect(res.body.product.source_url).toBe('https://example.com');
  });
});
