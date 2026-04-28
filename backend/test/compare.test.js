const request = require('supertest');
const express = require('express');
const multer = require('multer');
const createCompareRouter = require('../routes/compare.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockGetClient = vi.fn();
const mockVerifyAuth = (req, res, next) => {
  req.user = { id: 'user-123' };
  req.supabaseToken = 'tok';
  next();
};
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(express.json());
app.use(createCompareRouter(mockVerifyAuth, mockGetSupabaseAdmin, mockGetClient, upload));

// Error handler so 500s don't crash the test process
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const fakeImg = Buffer.from('fake-image-data');

describe('POST /api/compare', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 when scan_a_id is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scan_a_id/);
  });

  it('400 when scan_b_id is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scan_b_id/);
  });

  it('400 when image_a is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_a/);
  });

  it('400 when image_b is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_b/);
  });

  it('404 when only one scan belongs to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }], error: null })
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/access denied/i);
  });

  it('200 returns narrative when both scans belong to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }, { id: 'uuid-b' }], error: null })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Your skin has visibly improved.' } }]
          })
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Your skin has visibly improved.');
  });

  it('429 when all OpenRouter models return rate limit error', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }, { id: 'uuid-b' }], error: null })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('429: rate limit exceeded'))
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(429);
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(503);
  });
});
