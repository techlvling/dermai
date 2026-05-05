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

// ---------------------------------------------------------------------------
// Ingredient page helpers — loaded at startup; routes come before express.static
// so /sitemap.xml shadows the static file and /ingredient/:slug beats the 404 guard
// ---------------------------------------------------------------------------
const { enrichIngredient: _enrichIng, getBySlug: _getIngBySlug } = require('./lib/ingredient-enrich');
const _ingTpl = fs.readFileSync(path.join(__dirname, 'templates', 'ingredient.html'), 'utf8');
function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _sub(h, k, v) { return h.split(`{{${k}}}`).join(v); }

app.get('/sitemap.xml', (_req, res) => {
  const statics = [
    'https://tinkskin.in/', 'https://tinkskin.in/analyze.html',
    'https://tinkskin.in/donate.html', 'https://tinkskin.in/privacy.html',
    'https://tinkskin.in/terms.html',
  ];
  const ingUrls = (DATA.ingredients || [])
    .filter(i => i.description && i.description.trim())
    .map(i => `  <url><loc>https://tinkskin.in/ingredient/${i.id}</loc></url>`);
  const allLocs = statics.map(u => `  <url><loc>${u}</loc></url>`).concat(ingUrls);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allLocs.join('\n')}\n</urlset>`;
  res.set('Content-Type', 'application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
});

const _RATING_LABELS = { hero: '🏆 hero ingredient', solid: '✅ solid choice', mid: '💡 emerging evidence', caution: '⚠️ use with care' };

app.get('/ingredient/:slug', (req, res) => {
  const ing = _getIngBySlug(req.params.slug, DATA.ingredients || []);
  if (!ing) return res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'));

  const enriched = _enrichIng(ing, {
    concerns: DATA.concerns || {}, conflicts: DATA.conflicts || [],
    products: DATA.products || [], functionTags: DATA.functionTags || {},
  });

  const hasDesc   = !!(ing.description && ing.description.trim());
  const title     = `${ing.name} for skin — what it does, benefits, products | tinkskin`;
  const metaDesc  = hasDesc ? ing.description.slice(0, 155) : `${ing.name}: evidence-based skincare ingredient analysis.`;
  const canonical = `/ingredient/${ing.id}`;

  const ratingBadge   = `<span class="ing-rating-badge ing-rating-badge--${enriched.rating}">${_RATING_LABELS[enriched.rating] || enriched.rating}</span>`;
  const evidenceBadge = `<span class="ing-evidence-badge ing-evidence-badge--tier${ing.evidenceTier}">Tier ${ing.evidenceTier} Evidence</span>`;

  const functionChips = enriched.functionMeta
    .map(f => `<span class="ing-fn-chip" style="--chip-accent:${_esc(f.accent)}" title="${_esc(f.definition)}">${_esc(f.label)}</span>`)
    .join('');

  const editorial = ing.editorialBlurb
    ? `<section class="ing-section ing-editorial glass-panel"><span class="ing-editorial__badge">dermai take</span><p>${_esc(ing.editorialBlurb)}</p></section>`
    : '';

  const concernsHtml = enriched.relatedConcerns.length
    ? `<section class="ing-section glass-panel"><h2 class="ing-section__title">targets these concerns</h2><div class="ing-chips-row">${enriched.relatedConcerns.map(c => `<a href="/dashboard.html#ingredients" class="ing-concern-chip">${_esc(c.key)}</a>`).join('')}</div></section>`
    : '';

  const conflictsHtml = enriched.relatedConflicts.length
    ? `<section class="ing-section glass-panel"><h2 class="ing-section__title">don't combine with</h2><div class="ing-conflicts">${enriched.relatedConflicts.map(c => {
        const otherId = c.a === ing.id ? c.b : c.a;
        const other   = (DATA.ingredients || []).find(i => i.id === otherId);
        return `<div class="ing-conflict-card ing-conflict-card--${_esc(c.severity)}"><div class="ing-conflict__header"><a href="/ingredient/${_esc(otherId)}" class="ing-conflict__name">${_esc(other ? other.name : otherId)}</a><span class="ing-conflict__sev ing-conflict__sev--${_esc(c.severity)}">${_esc(c.severity)}</span></div><p class="ing-conflict__reason">${_esc(c.reason)}</p><p class="ing-conflict__tip">💡 ${_esc(c.tip)}</p></div>`;
      }).join('')}</div></section>`
    : '';

  const studiesHtml = ing.keyStudies && ing.keyStudies.length
    ? `<section class="ing-section glass-panel"><h2 class="ing-section__title">the studies</h2><div class="ing-studies">${ing.keyStudies.map(s => `<div class="ing-study"><a href="${_esc(s.link)}" target="_blank" rel="noopener noreferrer" class="ing-study__title">"${_esc(s.title)}"</a><div class="ing-study__meta">${_esc(s.journal)} (${_esc(String(s.year))}) · ${_esc(s.authors)}</div></div>`).join('')}</div></section>`
    : '';

  const productsHtml = enriched.relatedProducts.length
    ? `<section class="ing-section glass-panel"><h2 class="ing-section__title">products with this ingredient</h2><div class="ing-products">${enriched.relatedProducts.map(p => `<div class="ing-product-card"><span class="ing-product__name">${_esc(p.name)}</span><span class="ing-product__brand">${_esc(p.brand)}</span></div>`).join('')}</div></section>`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'DefinedTerm',
    name: ing.name, description: ing.description || '',
    url: `https://tinkskin.in${canonical}`,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'tinkskin Skincare Ingredient Glossary', url: 'https://tinkskin.in/dashboard.html#ingredients' },
    identifier: ing.id,
  });
  const ogTags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="https://tinkskin.in${canonical}" />`,
    `<meta property="og:title" content="${_esc(title)}" />`,
    `<meta property="og:description" content="${_esc(metaDesc)}" />`,
    `<meta property="og:image" content="https://tinkskin.in/public/og-image.png" />`,
    `<meta property="og:site_name" content="tinkskin" />`,
  ].join('\n    ');

  let html = _ingTpl;
  [
    ['TITLE', title], ['META_DESC', metaDesc],
    ['ROBOTS', hasDesc ? '' : '<meta name="robots" content="noindex" />'],
    ['CANONICAL', canonical], ['OG_TAGS', ogTags], ['JSON_LD', jsonLd],
    ['NAME', _esc(ing.name)], ['FUNCTION_CHIPS', functionChips],
    ['RATING_BADGE', ratingBadge], ['EVIDENCE_BADGE', evidenceBadge],
    ['DESCRIPTION', hasDesc ? _esc(ing.description) : '<em class="ing-empty">description coming soon</em>'],
    ['EDITORIAL', editorial], ['CONCERNS_HTML', concernsHtml],
    ['CONFLICTS_HTML', conflictsHtml], ['STUDIES_HTML', studiesHtml], ['PRODUCTS_HTML', productsHtml],
  ].forEach(([k, v]) => { html = _sub(html, k, v); });

  res.set('Cache-Control', 'public, max-age=3600').type('html').send(html);
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Admin SPA — built into backend/admin-dist (same __dirname, no path ambiguity in Lambda)
const adminDistPath = path.join(__dirname, 'admin-dist');
app.use('/admin', express.static(adminDistPath));
app.get('/admin/*splat', (_req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

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
  products:     JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'))),
  functionTags: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'function-tags.json'))),
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

// Tiny in-memory cache so we don't hit Supabase on every catalog request.
// 5-minute TTL so admin edits propagate quickly without hammering the DB.
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

let _ingCacheValue = null;
let _ingCacheAt    = 0;

// Cache slots for the three other catalog tables
const _catCache   = { products: null, concerns: null, conflicts: null };
const _catCacheAt = { products: 0,    concerns: 0,    conflicts: 0 };

async function getCatalog(key) {
  const now = Date.now();
  if (_catCache[key] && (now - _catCacheAt[key]) < CATALOG_CACHE_TTL_MS) {
    return _catCache[key];
  }
  try {
    const supabase = _getSupabaseAdmin();
    if (supabase) {
      const { data, error } = await supabase.from(key).select('*').order('id');
      if (!error && data?.length) {
        // concerns DB rows → object keyed by id to preserve existing API contract
        if (key === 'concerns') {
          const obj = {};
          for (const row of data) {
            obj[row.id] = { name: row.name, targetIngredients: row.target_ingredients, rationale: row.rationale };
          }
          _catCache[key] = obj;
        } else if (key === 'products') {
          // DB snake_case → camelCase to preserve existing API contract
          _catCache[key] = data.map(p => ({
            id:                  p.id,
            name:                p.name,
            brand:               p.brand,
            primaryIngredientId: p.primary_ingredient_id,
            category:            p.category,
            bestTimeOfDay:       p.best_time_of_day,
            concerns:            p.concerns,
            priceTier:           p.price_tier,
            productEvidenceTier: p.product_evidence_tier,
            categoryNote:        p.category_note,
            productTrials:       p.product_trials,
          }));
        } else {
          _catCache[key] = data;
        }
        _catCacheAt[key] = now;
        return _catCache[key];
      }
    }
  } catch (_) { /* fall through */ }
  // Fallback to bundled JSON on DB error
  _catCache[key] = DATA[key];
  _catCacheAt[key] = now;
  return DATA[key];
}

const ING_CACHE_TTL_MS = CATALOG_CACHE_TTL_MS;

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

app.get('/api/ingredients/:slug', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  const ing = _getIngBySlug(req.params.slug, DATA.ingredients || []);
  if (!ing) return res.status(404).json({ error: 'Ingredient not found' });
  const enriched = _enrichIng(ing, {
    concerns: DATA.concerns || {}, conflicts: DATA.conflicts || [],
    products: DATA.products || [], functionTags: DATA.functionTags || {},
  });
  res.json(enriched);
});

app.get('/api/function-tags', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(DATA.functionTags || {});
});

app.get('/api/concerns', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(await getCatalog('concerns'));
});

app.get('/api/conflicts', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(await getCatalog('conflicts'));
});

app.get('/api/products', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(await getCatalog('products'));
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

// Admin API — verifyAuth + requireAdmin applied inside the router
app.use('/api/admin', require('./routes/admin/index'));

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
