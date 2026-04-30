const request = require('supertest');
const express = require('express');
const createRoutineRouter = require('../routes/routine.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createRoutineRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('routine routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/routine — 200 returns logs for last 90 days', async () => {
    const logs = [{ id: '1', user_id: 'user-123', log_date: '2026-04-28', am_done: true, pm_done: false }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: logs, error: null }) });

    const res = await request(app).get('/api/routine');
    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual(logs);
  });

  it('POST /api/routine — 200 upserts log entry', async () => {
    const saved = { id: '2', user_id: 'user-123', log_date: '2026-04-28', am_done: true, pm_done: true };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app)
      .post('/api/routine')
      .send({ log_date: '2026-04-28', am_done: true, pm_done: true });
    expect(res.status).toBe(200);
    expect(res.body.log).toEqual(saved);
  });

  it('POST /api/routine — 400 when log_date is missing', async () => {
    const res = await request(app).post('/api/routine').send({ am_done: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/log_date/);
  });

  it('POST /api/routine — accepts valid slot_choices and round-trips them', async () => {
    const slot_choices = {
      am: { cleanser: { source: 'catalog', id: 'prod_cle_01' }, treatment: { source: 'user', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
      pm: { moisturizer: { source: 'catalog', id: 'prod_moi_03' } },
    };
    const saved = { id: '3', user_id: 'user-123', log_date: '2026-04-30', steps_done: { am: { cleanser: true } }, slot_choices };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app)
      .post('/api/routine')
      .send({ log_date: '2026-04-30', steps_done: { am: { cleanser: true } }, slot_choices });
    expect(res.status).toBe(200);
    expect(res.body.log.slot_choices).toEqual(slot_choices);
  });

  it('POST /api/routine — 400 when slot_choices is not an object', async () => {
    const res = await request(app)
      .post('/api/routine')
      .send({ log_date: '2026-04-30', slot_choices: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slot_choices/);
  });

  it('POST /api/routine — 400 when a slot choice has bad source', async () => {
    const res = await request(app)
      .post('/api/routine')
      .send({
        log_date: '2026-04-30',
        slot_choices: { am: { cleanser: { source: 'random', id: 'x' } } },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source/);
  });

  it('POST /api/routine — 400 when a slot choice is missing id', async () => {
    const res = await request(app)
      .post('/api/routine')
      .send({
        log_date: '2026-04-30',
        slot_choices: { pm: { treatment: { source: 'user' } } },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/);
  });
});
