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

// ALLOWED_ORIGINS env var supports preview deploys: comma-separated list
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'https://tinkskin.in', 'https://www.tinkskin.in', 'https://dermai-livid.vercel.app'];

app.use(cors({
  origin: allowedOrigins,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Legacy page redirects (must come before express.static so they win when files are gone)
const LEGACY_REDIRECTS = {
  '/history.html':         '/dashboard.html#history',
  '/ingredients.html':     '/dashboard.html#ingredients',
  '/shopping.html':        '/dashboard.html#treatment',
  '/recommendations.html': '/dashboard.html#routine',
};
app.get(Object.keys(LEGACY_REDIRECTS), (req, res) => {
  res.redirect(302, LEGACY_REDIRECTS[req.path]);
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Non-API 404 guard — must come AFTER express.static and BEFORE the API route
// modules. Any non-API path that express.static didn't serve is a real 404; we
// handle it here so the API routers (which apply verifyAuth to all paths) never
// see it and accidentally return 401 instead of a branded 404 page.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    return res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'));
  }
  next();
});

// ---------------------------------------------------------------------------
// Static data — loaded once at startup; routes serve from memory
// ---------------------------------------------------------------------------

const DATA = {
  ingredients: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ingredients.json'))),
  concerns:    JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'concerns.json'))),
  conflicts:   JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conflicts.json'))),
  products:    JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'))),
};

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const analyzeLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  // IP-based: analyze is a public endpoint (no auth). Authenticated compare
  // uses per-user keying instead (see routes/compare.js).
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analyses. Please wait before trying again.' }
});

// ---------------------------------------------------------------------------
// Multer — memory storage (no disk writes, works everywhere including Vercel)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  // 3 required angles + up to 3 optional close-ups = 6 max per /api/analyze
  limits: { fileSize: 4 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only image files are accepted'), { status: 400 }));
    }
  }
});

// ---------------------------------------------------------------------------
// AI clients — primary is Google AI Studio, OpenRouter is the safety-net fallback
// ---------------------------------------------------------------------------

let _aiStudioClient = null;
function getAIStudioClient() {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!key || key === 'your_aistudio_key_here') return null;
  if (!_aiStudioClient) {
    _aiStudioClient = new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: key
    });
  }
  return _aiStudioClient;
}

let _openRouterClient = null;
function getClient() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_openrouter_key_here') return null;
  if (!_openRouterClient) {
    _openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': 'https://tinkskin.in',
        'X-Title': 'tinkskin'
      }
    });
  }
  return _openRouterClient;
}

// ---------------------------------------------------------------------------
// Routes — public (no auth required)
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'tinkskin backend is running' });
});

app.get('/api/health-ai', async (_req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(500).json({ error: 'AI service not configured' });
  }
  try {
    const models = await client.models.list();
    const list = (models.data || []).slice(0, 20).map(m => m.id);
    res.json({ ok: true, provider: 'openrouter', count: list.length, sample: list });
  } catch (err) {
    console.error('[health-ai] error:', err.message);
    res.status(500).json({ error: 'AI service check failed' });
  }
});

// Need the admin client up here for the cache-aware /api/ingredients handler;
// mounted routes below also use it.
const { getSupabaseAdmin: _getSupabaseAdmin } = require('./lib/supabase');

// Tiny in-memory cache so we don't hit Supabase on every /api/ingredients
// request. The weekly cron is the only writer, so a 5-minute TTL is plenty.
let _ingCacheValue = null;
let _ingCacheAt    = 0;
const ING_CACHE_TTL_MS = 5 * 60 * 1000;

app.get('/api/ingredients', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');

  const now = Date.now();
  if (_ingCacheValue && (now - _ingCacheAt) < ING_CACHE_TTL_MS) {
    return res.json(_ingCacheValue);
  }

  // Try the DB cache (populated by /api/cron/refresh-evidence). Fall back to
  // the on-disk baseline if the cache is empty or DB is unreachable.
  try {
    const supabase = _getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from('evidence_cache')
        .select('ingredients, last_refreshed')
        .eq('id', 'singleton')
        .maybeSingle();
      if (data?.ingredients && Array.isArray(data.ingredients) && data.ingredients.length) {
        _ingCacheValue = data.ingredients;
        _ingCacheAt    = now;
        return res.json(_ingCacheValue);
      }
    }
  } catch (_) { /* fall through to file */ }

  _ingCacheValue = DATA.ingredients;
  _ingCacheAt    = now;
  res.json(_ingCacheValue);
});

app.get('/api/concerns', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(DATA.concerns);
});

app.get('/api/conflicts', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(DATA.conflicts);
});

app.get('/api/products', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(DATA.products);
});

// ---------------------------------------------------------------------------
// POST /api/analyze  — accepts 1-3 images, returns AI skin analysis
// ---------------------------------------------------------------------------

app.use(require('./routes/analyze')(upload, analyzeLimit, getAIStudioClient, getClient));

// ---------------------------------------------------------------------------
// Authenticated data routes
// ---------------------------------------------------------------------------
const { verifyAuth } = require('./middleware/auth');
const getSupabaseAdmin = _getSupabaseAdmin;

// Cron route is mounted DIRECTLY on app (not via a sub-router) so it lands
// before any router.use(verifyAuth) middleware that would otherwise intercept
// it. Vercel's weekly cron hits this path with `Authorization: Bearer
// ${CRON_SECRET}`. Manual testing via curl works the same way.
const cronHandler = require('./routes/cron').handler(getSupabaseAdmin);
app.get('/api/cron/refresh-evidence', cronHandler);
app.post('/api/cron/refresh-evidence', cronHandler);

app.use(require('./routes/scans')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/favorites')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/routine')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/diary')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/userRoutineItems')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/reactions')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/photos')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/compare')(verifyAuth, getSupabaseAdmin, getAIStudioClient, getClient, upload));

// ---------------------------------------------------------------------------
// 404 — serve branded page for unknown HTML routes, JSON for API routes
// ---------------------------------------------------------------------------

app.use((_req, res, next) => {
  if (_req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
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
  console.log(`tinkskin running at http://localhost:${PORT}`);
});

module.exports = app;
