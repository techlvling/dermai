/**
 * One-shot seed: reads backend/data/*.json and upserts into Supabase catalog tables.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node backend/scripts/seedCatalogToDb.js
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const DATA_DIR = path.join(__dirname, '..', 'data');

function read(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

async function seedProducts() {
  const raw = read('products.json');
  const rows = raw.map(p => ({
    id:                    p.id,
    name:                  p.name,
    brand:                 p.brand || null,
    primary_ingredient_id: p.primaryIngredientId || null,
    category:              p.category || null,
    best_time_of_day:      p.bestTimeOfDay || null,
    concerns:              p.concerns || [],
    price_tier:            p.priceTier || null,
    product_evidence_tier: p.productEvidenceTier || null,
    category_note:         p.categoryNote || null,
    product_trials:        p.productTrials || null,
    active:                true,
  }));

  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`products seed failed: ${error.message}`);
  console.log(`✓ products — ${rows.length} rows`);
}

async function seedIngredients() {
  const raw = read('ingredients.json');
  const rows = raw.map(ing => ({
    id:            ing.id,
    name:          ing.name,
    evidence_tier: ing.evidenceTier || null,
    evidence_type: ing.evidenceType || null,
    key_studies:   ing.keyStudies || null,
    summary:       ing.summary || null,
  }));

  const { error } = await supabase.from('ingredients').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`ingredients seed failed: ${error.message}`);
  console.log(`✓ ingredients — ${rows.length} rows`);
}

async function seedConcerns() {
  const raw = read('concerns.json');
  // concerns.json is an object keyed by concern name
  const rows = Object.entries(raw).map(([key, val]) => ({
    id:                 key,
    name:               key,
    target_ingredients: val.targetIngredients || [],
    rationale:          val.rationale || null,
  }));

  const { error } = await supabase.from('concerns').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`concerns seed failed: ${error.message}`);
  console.log(`✓ concerns — ${rows.length} rows`);
}

async function seedConflicts() {
  const raw = read('conflicts.json');
  const rows = raw.map(c => ({
    a:        c.a,
    b:        c.b,
    severity: c.severity || null,
    title:    c.title || null,
    reason:   c.reason || null,
    tip:      c.tip || null,
  }));

  // conflicts has bigserial PK — truncate and re-insert for idempotency
  const { error: delErr } = await supabase.from('conflicts').delete().neq('id', 0);
  if (delErr) throw new Error(`conflicts clear failed: ${delErr.message}`);

  const { error } = await supabase.from('conflicts').insert(rows);
  if (error) throw new Error(`conflicts seed failed: ${error.message}`);
  console.log(`✓ conflicts — ${rows.length} rows`);
}

async function main() {
  console.log('Seeding catalog tables…');
  await seedProducts();
  await seedIngredients();
  await seedConcerns();
  await seedConflicts();
  console.log('Done.');
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
