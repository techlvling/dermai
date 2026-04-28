const request = require('supertest');
const express = require('express');
const { createVerifyAuth } = require('../middleware/auth.js');
const { makeChain } = require('./helpers.js');

const mockGetUser = vi.fn();
const verifyAuth = createVerifyAuth(() => ({ auth: { getUser: mockGetUser } }));

const app = express();
app.use(express.json());
app.get('/test', verifyAuth, (req, res) => res.json({ uid: req.user.id }));

describe('verifyAuth middleware', () => {
  beforeEach(() => mockGetUser.mockReset());

  it('401 when no Authorization header', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/);
  });

  it('401 when Authorization is not Bearer', async () => {
    const res = await request(app).get('/test').set('Authorization', 'Basic sometoken');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/);
  });

  it('401 when Supabase returns null user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') });
    const res = await request(app).get('/test').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it('200 and attaches user when token is valid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.uid).toBe('user-abc');
  });

  it('502 when Supabase auth call throws', async () => {
    // Return a resolved Promise whose result throws on property access, so the
    // middleware's try/catch fires with no Promise rejection escaping to Vitest.
    mockGetUser.mockResolvedValue({
      get data() { throw new Error('network failure'); },
    });

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { headers: { authorization: 'Bearer some-token' } };
    const res = { status };
    const next = vi.fn();

    await verifyAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(502);
  });
});
