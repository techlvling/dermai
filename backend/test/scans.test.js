const request = require('supertest');
const express = require('express');
const createScansRouter = require('../routes/scans.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => { req.user = { id: 'user-123' }; req.supabaseToken = 'tok'; next(); };

const app = express();
app.use(express.json());
app.use(createScansRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('scans routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/scans', () => {
    it('200 returns scans list', async () => {
      const scans = [{ id: '1', result_json: { overallHealth: 80 }, created_at: '2026-01-01' }];
      mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: scans, error: null }) });

      const res = await request(app).get('/api/scans');
      expect(res.status).toBe(200);
      expect(res.body.scans).toEqual(scans);
    });

    it('500 on database error', async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: null, error: { message: 'db down' } }) });

      const res = await request(app).get('/api/scans');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/scans', () => {
    it('200 saves and returns scan', async () => {
      const saved = { id: '2', user_id: 'user-123', result_json: { overallHealth: 70 } };
      mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

      const res = await request(app).post('/api/scans').send({ result_json: { overallHealth: 70 } });
      expect(res.status).toBe(200);
      expect(res.body.scan).toEqual(saved);
    });

    it('400 when result_json is missing', async () => {
      const res = await request(app).post('/api/scans').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/result_json/);
    });
  });

  describe('DELETE /api/scans/:id', () => {
    it('200 on successful delete', async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [{ id: '1' }], error: null }) });

      const res = await request(app).delete('/api/scans/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('404 when scan not found', async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [], error: null }) });

      const res = await request(app).delete('/api/scans/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
