// One-shot enrichment: queries PubMed for each Tier 1+2 product and writes
// a `productTrials` array of real PMIDs onto each product in products.json.
//
// Strategy depends on the brand:
//   - Pharmaceutical actives (adapalene, benzoyl peroxide) — search the
//     molecule, not the brand. Active molecule has 100s of trials and brand
//     names rarely appear in trial titles.
//   - Cosmetic-but-clinically-tested platforms (SkinCeuticals, EltaMD,
//     Anthelios, RoC, CeraVe MVE, etc.) — brand DOES appear in titles.
//     Search brand + product hint.
//   - Generic dermatology-channel brands — search brand alone.
//
// Each candidate PMID gets a relevance check: the title must mention the
// brand OR the product's primary ingredient OR the first word of the
// product name. Otherwise it's discarded as noise.
//
// Run: node backend/scripts/enrichProductTrials.js

const fs = require('fs');
const path = require('path');

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const MAX_TRIALS_PER_PRODUCT = 3;
const PER_CALL_DELAY_MS = 500; // be polite to NCBI eutils

async function fetchJson(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
  finally { clearTimeout(t); }
}

function buildQuery(prod) {
  const brand = prod.brand;
  const productName = prod.name.toLowerCase();

  // Pharmaceutical actives — search the molecule, not the brand
  if (/adapalene/i.test(productName)) {
    return '"adapalene"[Title] AND (acne[Title/Abstract] OR aging[Title/Abstract]) AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])';
  }
  if (brand === 'PanOxyl' || /benzoyl peroxide/i.test(productName)) {
    return '"benzoyl peroxide"[Title] AND acne[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])';
  }

  // SkinCeuticals C E Ferulic — Pinnell papers
  if (brand === 'SkinCeuticals' && /ferulic/i.test(productName)) {
    return '("SkinCeuticals"[Title/Abstract] OR "C E Ferulic"[Title/Abstract] OR ("L-ascorbic acid"[Title/Abstract] AND "ferulic"[Title/Abstract])) AND skin[Title/Abstract]';
  }

  // Anthelios SPF platform — extensively studied
  if (/anthelios/i.test(productName)) {
    return '"Anthelios"[Title/Abstract] AND skin[Title/Abstract]';
  }

  // EltaMD UV Clear
  if (brand === 'EltaMD') {
    return '"EltaMD"[Title/Abstract] OR ("transparent zinc oxide"[Title/Abstract] AND niacinamide[Title/Abstract]) AND skin[Title/Abstract]';
  }

  // RoC Retinol Correxion
  if (brand === 'RoC' && /retinol/i.test(productName)) {
    return '("RoC"[Title/Abstract] OR "retinol correxion"[Title/Abstract]) AND (skin[Title/Abstract] OR aging[Title/Abstract])';
  }

  // CeraVe with MVE technology
  if (brand === 'CeraVe') {
    return '("CeraVe"[Title/Abstract] OR ("ceramide"[Title/Abstract] AND "MVE"[Title/Abstract])) AND skin[Title/Abstract]';
  }

  // Eucerin — urea formulations
  if (brand === 'Eucerin') {
    return '"Eucerin"[Title/Abstract] AND skin[Title/Abstract]';
  }

  // La Roche-Posay sub-lines
  if (brand === 'La Roche-Posay') {
    if (/effaclar/i.test(productName)) {
      return '"Effaclar"[Title/Abstract] AND (acne[Title/Abstract] OR skin[Title/Abstract])';
    }
    if (/toleriane/i.test(productName)) {
      return '"Toleriane"[Title/Abstract] AND skin[Title/Abstract]';
    }
    return '"La Roche-Posay"[Title/Abstract] AND skin[Title/Abstract]';
  }

  // Avène
  if (brand === 'Avene' || brand === 'Avène') {
    if (/cicalfate/i.test(productName)) {
      return '"Cicalfate"[Title/Abstract] AND skin[Title/Abstract]';
    }
    return '"Avene"[Title/Abstract] AND skin[Title/Abstract]';
  }

  // Generic dermatology-channel brands
  return `"${brand}"[Title/Abstract] AND skin[Title/Abstract]`;
}

async function fetchTrialsForProduct(prod) {
  const query = buildQuery(prod);
  const searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=8&retmode=json&sort=relevance`;
  const search = await fetchJson(searchUrl);
  const pmids = search?.esearchresult?.idlist || [];
  if (!pmids.length) return [];

  const summaryUrl = `${BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
  const summary = await fetchJson(summaryUrl);
  if (!summary?.result) return [];

  // Build relevance keywords for validation
  const brandLower = prod.brand.toLowerCase();
  const productKey = prod.name.toLowerCase().split(/\s+/)[0];
  const ingredientLower = (prod.primaryIngredientId || '').replace(/_/g, ' ');
  const productHints = prod.name.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const results = [];
  for (const pmid of pmids) {
    const doc = summary.result[pmid];
    if (!doc?.title) continue;
    const titleLower = doc.title.toLowerCase();
    const matches =
      titleLower.includes(brandLower) ||
      titleLower.includes(ingredientLower) ||
      productHints.some(w => titleLower.includes(w));
    if (!matches) continue;

    results.push({
      title: doc.title,
      journal: doc.fulljournalname,
      year: doc.pubdate ? doc.pubdate.split(' ')[0] : 'Unknown',
      pubmedId: pmid,
      link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      authors: doc.authors?.length
        ? doc.authors.slice(0, 3).map(a => a.name).join(', ') + (doc.authors.length > 3 ? ' et al.' : '')
        : 'Unknown',
    });
    if (results.length >= MAX_TRIALS_PER_PRODUCT) break;
  }
  return results;
}

(async () => {
  const ppath = path.join(__dirname, '..', 'data', 'products.json');
  const products = JSON.parse(fs.readFileSync(ppath));

  console.log(`Enriching ${products.length} products with real PubMed citations...`);
  console.log(`(only Tier 1 + Tier 2 — others rely on ingredient-level evidence)\n`);

  let enriched = 0;
  let totalTrials = 0;
  let withTrials = [];
  let withoutTrials = [];

  for (const prod of products) {
    if (!prod.productEvidenceTier || prod.productEvidenceTier > 2) continue;

    console.log(`[Tier ${prod.productEvidenceTier}] ${prod.brand} — ${prod.name}`);
    try {
      const trials = await fetchTrialsForProduct(prod);
      if (trials.length) {
        prod.productTrials = trials;
        enriched++;
        totalTrials += trials.length;
        withTrials.push(`${prod.brand} ${prod.name} (${trials.length})`);
        trials.forEach(t => console.log(`   ✓ [${t.year}] [PMID ${t.pubmedId}] ${t.title.slice(0, 90)}...`));
      } else {
        withoutTrials.push(`${prod.brand} ${prod.name}`);
        console.log('   (no specific brand-named trials found — keeping ingredient-level evidence)');
      }
    } catch (e) {
      withoutTrials.push(`${prod.brand} ${prod.name} (error: ${e.message})`);
      console.warn('   Error:', e.message);
    }
    await new Promise(r => setTimeout(r, PER_CALL_DELAY_MS));
  }

  fs.writeFileSync(ppath, JSON.stringify(products, null, 2));
  console.log(`\n========================================`);
  console.log(`Enriched ${enriched} products with ${totalTrials} trial citations.`);
  console.log(`========================================`);
  console.log(`\nWith trials (${withTrials.length}):`);
  withTrials.forEach(s => console.log('  ' + s));
  console.log(`\nWithout trials (${withoutTrials.length}):`);
  withoutTrials.forEach(s => console.log('  ' + s));
})();
