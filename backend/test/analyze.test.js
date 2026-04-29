const request = require('supertest');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const createAnalyzeRouter = require('../routes/analyze.js');

const mockGetClient = vi.fn();
const mockGetGroqClient = vi.fn();
const upload = multer({ storage: multer.memoryStorage() });
const noopLimit = rateLimit({ windowMs: 1000, max: 1000, skip: () => false });

const app = express();
app.use(createAnalyzeRouter(upload, noopLimit, mockGetClient, mockGetGroqClient));
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const fakeImg = Buffer.from('fake-image-data');
const validJSON = JSON.stringify({
  overallHealth: 80,
  skinType: 'Oily',
  concerns: [{ name: 'Acne', severity: 60, description: 'Moderate acne.' }]
});

describe('POST /api/analyze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 when no image is provided', async () => {
    mockGetClient.mockReturnValue({ chat: { completions: { create: vi.fn() } } });
    const res = await request(app).post('/api/analyze');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No image/);
  });

  it('500 with safe message when API key is not configured', async () => {
    mockGetClient.mockReturnValue(null);
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Analysis service not available.');
  });

  it('200 returns parsed JSON when first model succeeds', async () => {
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: validJSON } }]
          })
        }
      }
    });
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.overallHealth).toBe(80);
    expect(res.body.skinType).toBe('Oily');
    expect(res.body.concerns).toHaveLength(1);
  });

  it('accepts up to 3 images', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: validJSON } }]
    });
    mockGetClient.mockReturnValue({ chat: { completions: { create } } });
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('images', fakeImg, { filename: 'left.jpg',  contentType: 'image/jpeg' })
      .attach('images', fakeImg, { filename: 'right.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
  });

  it('tries next model when first model fails', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValue({ choices: [{ message: { content: validJSON } }] });
    mockGetClient.mockReturnValue({ chat: { completions: { create } } });
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('429 when all OpenRouter models return rate limit errors', async () => {
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('429: rate limit exceeded'))
        }
      }
    });
    mockGetGroqClient.mockReturnValue(null);
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit/i);
  });

  it('uses Groq fallback when entire OpenRouter chain fails', async () => {
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Service unavailable'))
        }
      }
    });
    mockGetGroqClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: validJSON } }]
          })
        }
      }
    });
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.overallHealth).toBe(80);
  });

  it('500 with safe message when AI returns no JSON block', async () => {
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Sorry, I cannot analyse this image.' } }]
          })
        }
      }
    });
    mockGetGroqClient.mockReturnValue(null);
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Analysis failed. Please try again.');
  });

  it('500 with safe message when AI returns malformed JSON', async () => {
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{ overallHealth: oops, "skinType": }' } }]
          })
        }
      }
    });
    mockGetGroqClient.mockReturnValue(null);
    const res = await request(app)
      .post('/api/analyze')
      .attach('images', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Analysis failed. Please try again.');
  });
});
