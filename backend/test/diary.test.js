const request = require('supertest');
const express = require('express');
const createDiaryRouter = require('../routes/diary.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createDiaryRouter(mockVerifyAuth, mockGetSupabaseAdmin));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

const TODAY = '2026-05-01';

const FULL_BODY = {
  log_date: TODAY,
  water_liters: 2.0,
  stress_1_5: 3,
  sleep_hours: 7.5,
  sun_minutes: 30,
  alcohol_drinks: 1,
  symptoms: ['acne_flare', 'dryness'],
  wellness_score: 72,
  scan_id: 42,
};

describe('GET /api/diary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 returns entries for the user', async () => {
    const entries = [{ log_date: TODAY, water_liters: 2.0, sun_minutes: 30, symptoms: ['acne_flare'], wellness_score: 70, scan_id: 1 }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: entries, error: null }) });

    const res = await request(app).get('/api/diary');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual(entries);
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);
    const res = await request(app).get('/api/diary');
    expect(res.status).toBe(503);
  });
});

describe('POST /api/diary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 upserts a full lifestyle entry', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: FULL_BODY, error: null }) });
    const res = await request(app).post('/api/diary').send(FULL_BODY);
    expect(res.status).toBe(200);
    expect(res.body.entry.symptoms).toEqual(['acne_flare', 'dryness']);
    expect(res.body.entry.wellness_score).toBe(72);
    expect(res.body.entry.scan_id).toBe(42);
  });

  it('200 partial-upserts just water (legacy diary path)', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: { log_date: TODAY, water_liters: 1.5 }, error: null }) });
    const res = await request(app).post('/api/diary').send({ log_date: TODAY, water_liters: 1.5 });
    expect(res.status).toBe(200);
  });

  it('400 when log_date is missing', async () => {
    const res = await request(app).post('/api/diary').send({ water_liters: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/log_date/);
  });

  it('400 when sun_minutes is out of range', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, sun_minutes: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sun_minutes/);
  });

  it('400 when alcohol_drinks is not an integer', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, alcohol_drinks: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alcohol_drinks/);
  });

  it('400 when symptoms contains an unknown value', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, symptoms: ['acne_flare', 'volcano'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/symptoms/);
  });

  it('400 when symptoms is not an array', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, symptoms: 'acne_flare' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/symptoms/);
  });

  it('400 when wellness_score exceeds 100', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, wellness_score: 105 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wellness_score/);
  });

  it('400 when scan_id is not an integer', async () => {
    const res = await request(app).post('/api/diary').send({ ...FULL_BODY, scan_id: 'forty-two' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scan_id/);
  });

  it('exposes ALLOWED_SYMPTOMS for frontend reuse', () => {
    expect(createDiaryRouter.ALLOWED_SYMPTOMS).toEqual(['acne_flare', 'dryness', 'redness', 'irritation', 'breakout']);
  });
});
