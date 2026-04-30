const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GROQ_TEXT_MODELS } = require('../lib/ai-models');

const CATEGORIES = ['cleanser', 'treatment', 'moisturizer', 'sunscreen'];
const TIMES = ['AM', 'PM', 'both'];

// ── Pure helpers (also exported for unit testing) ─────────────────────────

// Split a free-text ingredient list (commas / semicolons / newlines), strip
// parenthesized junk, lowercase, trim. Cap at 50 tokens to avoid runaway input.
function parseIngredientsText(text) {
  return String(text || '')
    .split(/[,;\n]/)
    .map(s => s.replace(/\(.*?\)/g, '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);
}

// Build a name → id index from ingredients.json. Lazy-loaded by the route.
function buildIngredientIndex(ingredients) {
  const byNorm = new Map();
  for (const ing of ingredients) {
    byNorm.set(ing.id.toLowerCase(), ing.id);
    byNorm.set(ing.name.toLowerCase(), ing.id);
    byNorm.set(ing.name.toLowerCase().replace(/\s+/g, '_'), ing.id);
  }
  return { byNorm, list: ingredients };
}

// Try direct lookup first, then substring containment as a fallback.
function matchIngredient(raw, idx) {
  const norm = String(raw).toLowerCase().trim();
  if (!norm) return null;
  const direct = idx.byNorm.get(norm) || idx.byNorm.get(norm.replace(/\s+/g, '_'));
  if (direct) return direct;
  for (const ing of idx.list) {
    const name = ing.name.toLowerCase();
    if (norm.includes(name) || name.includes(norm)) return ing.id;
  }
  return null;
}

// Cache key: sha256-16hex of normalized brand + name + sorted matched ids.
// Two pastes of the same product hash to the same key regardless of how
// the user typed their ingredient list.
function computeCacheKey(brand, name, mappedIds) {
  const input = [
    String(brand || '').toLowerCase().trim(),
    String(name  || '').toLowerCase().trim(),
    [...mappedIds].sort().join(','),
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function extractJSON(text) {
  const cleaned = String(text || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (_) { return null; }
}

// ── Route factory ─────────────────────────────────────────────────────────

function createProductEvaluationsRouter(verifyAuth, getSupabaseAdmin, getClient, getGroqClient) {
  const router = express.Router();
  router.use(verifyAuth);

  let _ingIdx = null;
  function loadIngredientIndex() {
    if (_ingIdx) return _ingIdx;
    const ings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ingredients.json')));
    _ingIdx = buildIngredientIndex(ings);
    return _ingIdx;
  }

  async function callAIChain(prompt) {
    const messages = [{ role: 'user', content: prompt }];
    const openRouterModels = [
      'google/gemma-4-31b-it:free',
      'google/gemma-3-27b-it:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ];
    const client = getClient();
    let response = null, modelUsed = null, lastError = null;

    if (client) {
      for (const model of openRouterModels) {
        try {
          const completion = await client.chat.completions.create({
            model, messages, temperature: 0.3, max_tokens: 600,
          });
          response = completion.choices[0].message.content;
          modelUsed = model;
          break;
        } catch (e) { lastError = e; }
      }
    }
    if (!response) {
      const groq = getGroqClient();
      if (groq) {
        for (const model of GROQ_TEXT_MODELS) {
          try {
            const completion = await groq.chat.completions.create({
              model, messages, temperature: 0.3, max_tokens: 600,
            });
            response = completion.choices[0].message.content;
            modelUsed = `groq:${model}`;
            break;
          } catch (e) { lastError = e; }
        }
      }
    }
    if (!response) throw lastError || new Error('All AI providers failed');
    return { response, modelUsed };
  }

  // POST /api/evaluate-product — cache lookup, AI eval on miss, insert + return.
  router.post('/api/evaluate-product', async (req, res) => {
    const { name, brand, raw_ingredients_text, category, best_time_of_day } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (typeof raw_ingredients_text !== 'string' || !raw_ingredients_text.trim()) {
      return res.status(400).json({ error: 'raw_ingredients_text is required' });
    }
    if (category != null && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (best_time_of_day != null && !TIMES.includes(best_time_of_day)) {
      return res.status(400).json({ error: `best_time_of_day must be one of: ${TIMES.join(', ')}` });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const idx = loadIngredientIndex();
    const tokens = parseIngredientsText(raw_ingredients_text);
    const mapped = [], unmapped = [];
    for (const t of tokens) {
      const id = matchIngredient(t, idx);
      if (id) mapped.push(id); else unmapped.push(t);
    }
    const uniqMapped = [...new Set(mapped)];
    const cacheKey = computeCacheKey(brand, name, uniqMapped);

    // Cache lookup
    const { data: cached } = await supabase
      .from('product_evaluations')
      .select('*')
      .eq('key', cacheKey)
      .maybeSingle();
    if (cached) {
      return res.json({ evaluation: cached, fromCache: true });
    }

    // AI evaluation
    const prompt =
      `You are a clinical-evidence-aware skincare expert. Evaluate this product:\n` +
      `Brand: ${brand || 'unknown'}\n` +
      `Name: ${name}\n` +
      `Matched ingredients (canonical ids): ${uniqMapped.join(', ') || 'none'}\n` +
      `Unmatched ingredients (raw): ${unmapped.slice(0, 10).join(', ') || 'none'}\n\n` +
      `Return ONLY a raw JSON object — no markdown fences:\n` +
      `{"score":1-10,"summary":"one-sentence verdict","recommended_slot":{"key":"cleanser|treatment|moisturizer|sunscreen","time":"AM|PM|both"},"conflicts":["ingredient_id"],"evidence_notes":[{"ingredient":"id","note":"short clinical note"}]}\n\n` +
      `score: 10 = strong RCT-backed actives, well-formulated; 5 = mediocre; 1 = no evidence.\n` +
      `Known canonical ingredient ids: ${idx.list.map(i => i.id).join(', ')}.\n` +
      `Raw JSON only. No markdown.`;

    let verdict, modelUsed;
    try {
      const aiResult = await callAIChain(prompt);
      verdict = extractJSON(aiResult.response);
      modelUsed = aiResult.modelUsed;
      if (!verdict || typeof verdict !== 'object') {
        return res.status(500).json({ error: 'AI returned invalid response' });
      }
    } catch (_) {
      return res.status(503).json({ error: 'AI service unavailable — try again' });
    }

    const finalCategory = category
      || (CATEGORIES.includes(verdict.recommended_slot?.key) ? verdict.recommended_slot.key : 'treatment');
    const finalTime = best_time_of_day
      || (TIMES.includes(verdict.recommended_slot?.time) ? verdict.recommended_slot.time : 'both');

    const row = {
      key: cacheKey,
      name: name.trim(),
      brand: brand?.trim() || null,
      ingredients: uniqMapped,
      unmapped_ingredients: unmapped.slice(0, 20),
      category: finalCategory,
      best_time_of_day: finalTime,
      verdict_json: verdict,
      model: modelUsed,
    };
    const { data: saved, error: insertErr } = await supabase
      .from('product_evaluations')
      .insert(row)
      .select('*')
      .single();

    if (insertErr) {
      // Race: a concurrent caller inserted the same key. Re-fetch.
      const { data: race } = await supabase
        .from('product_evaluations')
        .select('*')
        .eq('key', cacheKey)
        .maybeSingle();
      if (race) return res.json({ evaluation: race, fromCache: false });
      return res.status(500).json({ error: insertErr.message });
    }

    res.json({ evaluation: saved, fromCache: false });
  });

  // POST /api/user-products/from-evaluation — turn a cached evaluation into a
  // row in the caller's user_products list, optionally with the source URL.
  router.post('/api/user-products/from-evaluation', async (req, res) => {
    const { evaluation_id, source_url } = req.body || {};
    if (typeof evaluation_id !== 'string' || !evaluation_id) {
      return res.status(400).json({ error: 'evaluation_id is required' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data: evaluation, error: evalErr } = await supabase
      .from('product_evaluations')
      .select('*')
      .eq('id', evaluation_id)
      .maybeSingle();
    if (evalErr) return res.status(500).json({ error: evalErr.message });
    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });

    const row = {
      user_id: req.user.id,
      name: evaluation.name,
      brand: evaluation.brand,
      category: evaluation.category,
      best_time_of_day: evaluation.best_time_of_day,
      ingredients: evaluation.ingredients || [],
      source_url: typeof source_url === 'string' ? source_url : null,
      evaluation_id: evaluation.id,
    };
    const { data, error } = await supabase
      .from('user_products')
      .insert(row)
      .select('id, name, brand, category, best_time_of_day, ingredients, source_url, evaluation_id, created_at')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ product: data });
  });

  return router;
}

module.exports = createProductEvaluationsRouter;
module.exports.parseIngredientsText = parseIngredientsText;
module.exports.buildIngredientIndex = buildIngredientIndex;
module.exports.matchIngredient = matchIngredient;
module.exports.computeCacheKey = computeCacheKey;
module.exports.extractJSON = extractJSON;
