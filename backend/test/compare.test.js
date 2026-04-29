const request = require('supertest');
const express = require('express');
const multer = require('multer');
const createCompareRouter = require('../routes/compare.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockGetClient = vi.fn();
const mockGetGroqClient = vi.fn();
const mockVerifyAuth = (req, res, next) => {
  req.user = { id: 'user-123' };
  req.supabaseToken = 'tok';
  next();
};
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(express.json());
app.use(createCompareRouter(mockVerifyAuth, mockGetSupabaseAdmin, mockGetClient, upload, mockGetGroqClient));

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

  it('400 when only one image is provided', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    // image_b omitted — should 400, not silently fall to text mode
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/both image_a and image_b/i);
  });

  it('text-only mode: 200 when images are missing but result_json exists', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({
        data: [
          { id: 'uuid-a', result_json: { overallHealth: 85, skinType: 'oily', concerns: [{ name: 'acne', severity: 60, description: 'moderate acne' }] } },
          { id: 'uuid-b', result_json: { overallHealth: 90, skinType: 'oily', concerns: [{ name: 'acne', severity: 40, description: 'mild acne' }] } }
        ],
        error: null
      })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Your skin has improved significantly.' } }]
          })
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b');
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Your skin has improved significantly.');
  });

  it('text-only mode: 400 when result_json is missing', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({
        data: [
          { id: 'uuid-a', result_json: null },
          { id: 'uuid-b', result_json: null }
        ],
        error: null
      })
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('text-only mode: 404 when scan does not belong to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a', result_json: {} }], error: null })
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b');
    // no image attachments — exercises text-only ownership check
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/access denied/i);
  });

  it('visual mode: 200 returns narrative when both scans with images belong to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a', result_json: {} }, { id: 'uuid-b', result_json: {} }], error: null })
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
      from: () => makeChain({ data: [{ id: 'uuid-a', result_json: {} }, { id: 'uuid-b', result_json: {} }], error: null })
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

  it('500 on Supabase query error returns user-safe message', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: null, error: { message: 'connection refused' } })
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Something went wrong. Please try again.');
  });

  it('falls back to Groq when all OpenRouter models fail (text mode)', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({
        data: [
          { id: 'uuid-a', result_json: { overallHealth: 80, skinType: 'Oily', concerns: [] } },
          { id: 'uuid-b', result_json: { overallHealth: 88, skinType: 'Oily', concerns: [] } }
        ],
        error: null
      })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Model unavailable'))
        }
      }
    });
    mockGetGroqClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Your skin has improved significantly.' } }]
          })
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b');
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Your skin has improved significantly.');
  });
});
