const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const multer    = require('multer');
const { GoogleGenAI } = require('@google/genai');
const rateLimit = require('express-rate-limit');

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
// Routes — data files
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DermAI backend is running' });
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

app.get('/api/products', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'))));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load products database' });
  }
});

// Diagnostic: list accessible Gemini models for this API key
app.get('/api/models', async (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_api_key_here') {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in .env' });
  }
  try {
    const ai   = new GoogleGenAI({ apiKey: key });
    const iter = await ai.models.list();
    const list = [];
    for await (const m of iter) {
      list.push({ name: m.name, displayName: m.displayName, methods: m.supportedGenerationMethods });
    }
    res.json({ count: list.length, models: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze  — accepts 1-3 images, returns Gemini skin analysis
// ---------------------------------------------------------------------------

app.post('/api/analyze', analyzeLimit, upload.array('images', 3), async (req, res) => {
  try {
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'No image received. Field name must be "images".' });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'your_api_key_here') {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set in backend/.env' });
    }

    // Convert each uploaded buffer directly to base64 — no disk I/O needed
    const imageParts = files.map(file => ({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString('base64')
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

    // @google/genai v1.x: contents must be Content[], each with role + parts
    const contents = [{
      role: 'user',
      parts: [{ text: prompt }, ...imageParts]
    }];

    const ai           = new GoogleGenAI({ apiKey: key });
    const modelsToTry  = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17'];
    let geminiResponse = null;
    let lastError      = null;
    let quotaHit       = false;

    for (const model of modelsToTry) {
      try {
        console.log(`[analyze] ${model} — ${count} image(s)`);
        geminiResponse = await ai.models.generateContent({ model, contents });
        console.log(`[analyze] success: ${model}`);
        break;
      } catch (err) {
        const msg = String(err.message || err);
        console.warn(`[analyze] ${model} failed:`, msg.slice(0, 300));
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
          quotaHit = true;
        }
        lastError = err;
      }
    }

    if (!geminiResponse) {
      if (quotaHit) {
        return res.status(429).json({
          error: 'Gemini API daily quota reached. Enable billing at aistudio.google.com or try again tomorrow.'
        });
      }
      throw lastError || new Error('All Gemini models failed');
    }

    const rawText = geminiResponse.text;
    console.log('[analyze] raw Gemini output:', rawText.slice(0, 400));

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Gemini returned no JSON block. Output: ' + rawText.slice(0, 200));
    }

    res.json(JSON.parse(match[0]));

  } catch (err) {
    console.error('[analyze] error:', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---------------------------------------------------------------------------
// Global JSON error handler (catches multer errors, validation errors, etc.)
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
