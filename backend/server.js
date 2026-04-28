const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const multer    = require('multer');
const { OpenAI } = require('openai');
const rateLimit = require('express-rate-limit');

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://dermai-livid.vercel.app'
  ],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const analyzeLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analyses. Please wait before trying again.' }
});

// ---------------------------------------------------------------------------
// Multer — memory storage (no disk writes, works everywhere including Vercel)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only image files are accepted'), { status: 400 }));
    }
  }
});

// ---------------------------------------------------------------------------
// OpenRouter client (OpenAI-compatible)
// ---------------------------------------------------------------------------

function getClient() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_openrouter_key_here') return null;
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://dermai-livid.vercel.app',
      'X-Title': 'DermAI'
    }
  });
}

// ---------------------------------------------------------------------------
// Authenticated data routes
// ---------------------------------------------------------------------------
const { verifyAuth } = require('./middleware/auth');
const { getSupabaseAdmin } = require('./lib/supabase');
app.use(require('./routes/scans')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/favorites')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/routine')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/reactions')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/photos')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/compare')(verifyAuth, getSupabaseAdmin, getClient, upload));

// ---------------------------------------------------------------------------
// Routes — data files
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DermAI backend is running' });
});

app.get('/api/health-ai', async (_req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set in .env' });
  }
  try {
    const models = await client.models.list();
    const list = (models.data || []).slice(0, 20).map(m => m.id);
    res.json({ ok: true, provider: 'openrouter', count: list.length, sample: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ingredients', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ingredients.json'))));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load ingredients database' });
  }
});

app.get('/api/concerns', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'concerns.json'))));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load concerns database' });
  }
});

app.get('/api/conflicts', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conflicts.json'))));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load conflicts database' });
  }
});

app.get('/api/products', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'))));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load products database' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze  — accepts 1-3 images, returns AI skin analysis
// ---------------------------------------------------------------------------

app.post('/api/analyze', analyzeLimit, upload.array('images', 3), async (req, res) => {
  try {
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'No image received. Field name must be "images".' });
    }

    const client = getClient();
    if (!client) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set in backend/.env' });
    }

    // Build image content parts using data URLs (OpenRouter/OpenAI vision format)
    const imageContents = files.map(file => ({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      }
    }));

    const count     = files.length;
    const photoWord = count === 1 ? 'photo' : `${count} photos (front, left, right)`;

    const prompt =
      `You are an expert dermatologist. You are looking at ${photoWord} of a patient's face.\n` +
      (count > 1 ? 'Aggregate findings across all angles. Use the worst-angle severity for each concern.\n' : '') +
      '\nReturn ONLY a raw JSON object — no markdown fences, no explanation:\n' +
      '{"overallHealth":72,"skinType":"Combination","concerns":[' +
      '{"name":"Acne","severity":65,"description":"Active breakouts on forehead and chin."},' +
      '{"name":"Hyperpigmentation","severity":40,"description":"Mild post-inflammatory dark spots."}' +
      ']}\n\n' +
      'Rules:\n' +
      '- overallHealth: integer 1-100 (100 = perfect skin)\n' +
      '- skinType: exactly one of Oily, Dry, Combination, Normal\n' +
      '- concerns: 1-5 items, only what is actually visible in the image(s)\n' +
      '  - name: one of Acne, Hyperpigmentation, Pores, Fine Lines, Texture, Dryness, Oiliness, Sensitivity\n' +
      '  - severity: integer 1-100\n' +
      '  - description: 1-2 plain-English sentences about what you observe\n' +
      'Raw JSON only. No markdown.';

    const messages = [{
      role: 'user',
      content: [{ type: 'text', text: prompt }, ...imageContents]
    }];

    // Model fallback chain — cheapest first, all support vision via OpenRouter
    const modelsToTry = [
      'qwen/qwen-2.5-vl-72b-instruct',
      'meta-llama/llama-3.2-11b-vision-instruct',
      'openai/gpt-4o-mini'
    ];

    let aiResponse  = null;
    let lastError   = null;
    let quotaHit    = false;

    for (const model of modelsToTry) {
      try {
        console.log(`[analyze] ${model} — ${count} image(s)`);
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 800
        });
        aiResponse = completion.choices[0].message.content;
        console.log(`[analyze] success: ${model}`);
        break;
      } catch (err) {
        const msg = String(err.message || err);
        console.warn(`[analyze] ${model} failed:`, msg.slice(0, 300));
        if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
          quotaHit = true;
        }
        lastError = err;
      }
    }

    if (!aiResponse) {
      if (quotaHit) {
        return res.status(429).json({
          error: 'AI rate limit reached. Please wait a moment and try again.'
        });
      }
      throw lastError || new Error('All AI models failed');
    }

    console.log('[analyze] raw output:', aiResponse.slice(0, 400));

    const match = aiResponse.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI returned no JSON block. Output: ' + aiResponse.slice(0, 200));
    }

    res.json(JSON.parse(match[0]));

  } catch (err) {
    console.error('[analyze] error:', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---------------------------------------------------------------------------
// 404 — serve branded page for unknown HTML routes, JSON for API routes
// ---------------------------------------------------------------------------

app.use((_req, res, next) => {
  if (_req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No route: ${_req.method} ${_req.path}` });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'));
});

// ---------------------------------------------------------------------------
// Global JSON error handler
// ---------------------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error('[express] error:', err.message || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start (local dev only — Vercel ignores app.listen)
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`DermAI running at http://localhost:${PORT}`);
});

module.exports = app;
