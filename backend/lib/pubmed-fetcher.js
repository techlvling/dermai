// Shared PubMed scraper used by:
//   1. backend/scripts/fetchPubMed.js — manual local refresh, writes to file
//   2. backend/routes/cron.js — weekly Vercel cron, writes to evidence_cache table
//
// Uses native fetch (Node 18+, default on Vercel) instead of execSync('curl')
// so it works in the serverless runtime where curl isn't available.

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Per-ingredient query metadata. evidenceTier reflects the strength of the
// existing literature (1 = strong RCT-backed, 2 = supportive clinical, 3 =
// preclinical / anecdotal). aliases gate-keep the result: a returned PMID is
// only kept if its title mentions one of these strings (case-insensitive),
// to filter out tangentially-matched papers.
const INGREDIENTS_META = [
  { id: 'salicylic_acid',     name: 'Salicylic Acid',     aliases: ['salicylic acid', 'BHA', 'beta hydroxy acid'], evidenceTier: 1, query: '"salicylic acid"[Title/Abstract] AND (acne[Title/Abstract] OR skin[Title/Abstract]) AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
  { id: 'niacinamide',        name: 'Niacinamide',        aliases: ['niacinamide', 'nicotinamide', 'vitamin b3'],  evidenceTier: 1, query: 'niacinamide[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
  { id: 'tretinoin',          name: 'Tretinoin',          aliases: ['tretinoin', 'retinoic acid', 'retinoid'],     evidenceTier: 1, query: 'tretinoin[Title/Abstract] AND (acne[Title/Abstract] OR aging[Title/Abstract] OR wrinkles[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'benzoyl_peroxide',   name: 'Benzoyl Peroxide',   aliases: ['benzoyl peroxide'],                            evidenceTier: 1, query: '"benzoyl peroxide"[Title/Abstract] AND acne[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'hyaluronic_acid',    name: 'Hyaluronic Acid',    aliases: ['hyaluronic acid', 'hyaluronate'],              evidenceTier: 1, query: '"hyaluronic acid"[Title/Abstract] AND skin[Title/Abstract] AND (hydration[Title/Abstract] OR moistur*[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'vitamin_c',          name: 'Vitamin C',          aliases: ['vitamin c', 'ascorbic acid', 'ascorbate', 'l-ascorbic acid'], evidenceTier: 1, query: '(ascorbic acid[Title/Abstract] OR "vitamin c"[Title/Abstract]) AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
  { id: 'azelaic_acid',       name: 'Azelaic Acid',       aliases: ['azelaic acid'],                                evidenceTier: 1, query: '"azelaic acid"[Title/Abstract] AND (acne[Title/Abstract] OR skin[Title/Abstract] OR rosacea[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'ceramides',          name: 'Ceramides',          aliases: ['ceramide', 'ceramides'],                       evidenceTier: 1, query: 'ceramide[Title/Abstract] AND skin[Title/Abstract] AND (barrier[Title/Abstract] OR moistur*[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'alpha_arbutin',      name: 'Alpha Arbutin',      aliases: ['arbutin', 'alpha arbutin', 'alpha-arbutin'],   evidenceTier: 1, query: 'arbutin[Title/Abstract] AND (skin[Title/Abstract] OR pigment*[Title/Abstract] OR melanin[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'lactic_acid',        name: 'Lactic Acid',        aliases: ['lactic acid', 'AHA', 'alpha hydroxy acid'],    evidenceTier: 1, query: '"lactic acid"[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
  { id: 'glycolic_acid',      name: 'Glycolic Acid',      aliases: ['glycolic acid', 'AHA', 'alpha hydroxy acid'],  evidenceTier: 1, query: '"glycolic acid"[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
  { id: 'retinol',            name: 'Retinol',            aliases: ['retinol', 'vitamin a', 'retinoid'],            evidenceTier: 1, query: 'retinol[Title/Abstract] AND skin[Title/Abstract] AND (aging[Title/Abstract] OR wrinkle*[Title/Abstract] OR anti-aging[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'zinc_oxide',         name: 'Zinc Oxide',         aliases: ['zinc oxide', 'zinc'],                          evidenceTier: 1, query: '"zinc oxide"[Title/Abstract] AND skin[Title/Abstract] AND (sunscreen[Title/Abstract] OR UV[Title/Abstract] OR acne[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'kojic_acid',         name: 'Kojic Acid',         aliases: ['kojic acid'],                                  evidenceTier: 1, query: '"kojic acid"[Title/Abstract] AND (skin[Title/Abstract] OR pigment*[Title/Abstract] OR whitening[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'peptides',           name: 'Peptides',           aliases: ['peptide', 'peptides', 'palmitoyl'],            evidenceTier: 1, query: '(peptide[Title/Abstract] OR palmitoyl[Title/Abstract]) AND skin[Title/Abstract] AND (aging[Title/Abstract] OR collagen[Title/Abstract] OR wrinkle*[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'bakuchiol',          name: 'Bakuchiol',          aliases: ['bakuchiol'],                                   evidenceTier: 2, query: 'bakuchiol[Title/Abstract] AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'copper_peptides',    name: 'Copper Peptides',    aliases: ['copper peptide', 'GHK-Cu', 'GHK', 'tripeptide'], evidenceTier: 2, query: '("copper peptide"[Title/Abstract] OR GHK[Title/Abstract] OR "tripeptide"[Title/Abstract]) AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'panthenol',          name: 'Panthenol',          aliases: ['panthenol', 'pantothenic acid', 'provitamin b5'], evidenceTier: 2, query: '(panthenol[Title/Abstract] OR "provitamin B5"[Title/Abstract]) AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'allantoin',          name: 'Allantoin',          aliases: ['allantoin'],                                   evidenceTier: 2, query: 'allantoin[Title/Abstract] AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'centella_asiatica',  name: 'Centella Asiatica',  aliases: ['centella asiatica', 'centella', 'asiaticoside', 'gotu kola', 'cica', 'madecassoside'], evidenceTier: 2, query: '("centella asiatica"[Title/Abstract] OR asiaticoside[Title/Abstract] OR madecassoside[Title/Abstract]) AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'snail_mucin',        name: 'Snail Mucin',        aliases: ['snail mucin', 'snail secretion', 'snail filtrate', 'snail extract', 'snail mucus', 'helix aspersa'], evidenceTier: 3, query: '("snail mucin"[Title/Abstract] OR "snail secretion filtrate"[Title/Abstract] OR "snail mucus"[Title/Abstract] OR "Helix aspersa"[Title/Abstract]) AND skin[Title/Abstract]' },
  { id: 'egf',                name: 'Epidermal Growth Factor', aliases: ['epidermal growth factor', 'EGF', 'rh-EGF'], evidenceTier: 2, query: '("epidermal growth factor"[Title/Abstract] OR "EGF"[Title/Abstract]) AND skin[Title/Abstract] AND (aging[Title/Abstract] OR wound[Title/Abstract] OR cosmetic[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'mandelic_acid',      name: 'Mandelic Acid',      aliases: ['mandelic acid'],                               evidenceTier: 2, query: '"mandelic acid"[Title/Abstract] AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'urea',               name: 'Urea',               aliases: ['urea'],                                        evidenceTier: 2, query: 'urea[Title/Abstract] AND skin[Title/Abstract] AND (xerosis[Title/Abstract] OR moistur*[Title/Abstract] OR keratolytic[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'squalane',           name: 'Squalane',           aliases: ['squalane', 'squalene'],                        evidenceTier: 2, query: '(squalane[Title/Abstract] OR squalene[Title/Abstract]) AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'polyhydroxy_acids',  name: 'Polyhydroxy Acids',  aliases: ['polyhydroxy acid', 'gluconolactone', 'lactobionic acid', 'PHA'], evidenceTier: 2, query: '(polyhydroxy[Title/Abstract] OR gluconolactone[Title/Abstract] OR "lactobionic acid"[Title/Abstract]) AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'tranexamic_acid',    name: 'Tranexamic Acid',    aliases: ['tranexamic acid', 'TXA'],                      evidenceTier: 1, query: '"tranexamic acid"[Title/Abstract] AND (melasma[Title/Abstract] OR pigment*[Title/Abstract] OR skin[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'sulfur',             name: 'Sulfur',             aliases: ['sulfur', 'sulphur'],                           evidenceTier: 2, query: '(sulfur[Title/Abstract] OR sulphur[Title/Abstract]) AND (acne[Title/Abstract] OR rosacea[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'beta_glucan',        name: 'Beta-Glucan',        aliases: ['beta-glucan', 'beta glucan'],                  evidenceTier: 2, query: '"beta-glucan"[Title/Abstract] AND skin[Title/Abstract] AND clinical trial[ptyp]' },
  { id: 'adenosine',          name: 'Adenosine',          aliases: ['adenosine'],                                   evidenceTier: 3, query: 'adenosine[Title/Abstract] AND skin[Title/Abstract] AND (aging[Title/Abstract] OR wrinkle*[Title/Abstract] OR cosmetic[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'hydroquinone',       name: 'Hydroquinone',       aliases: ['hydroquinone', 'HQ'],                          evidenceTier: 1, query: 'hydroquinone[Title/Abstract] AND (melasma[Title/Abstract] OR pigment*[Title/Abstract] OR hyperpigmentation[Title/Abstract]) AND clinical trial[ptyp]' },
  { id: 'ivermectin',         name: 'Ivermectin (topical)', aliases: ['ivermectin', 'soolantra'],                   evidenceTier: 1, query: '("ivermectin"[Title/Abstract] OR "Soolantra"[Title/Abstract]) AND (rosacea[Title/Abstract] OR skin[Title/Abstract]) AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])' },
];

async function fetchJson(url) {
  // 12s timeout — NCBI eutils sometimes hangs.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Returns the full ingredients array (same shape as the on-disk
// ingredients.json: id, name, evidenceTier, evidenceType, keyStudies[]).
// Each keyStudies entry: { title, journal, year, pubmedId, link, authors }.
//
// `log` is an optional (msg) => void callback so callers can stream progress.
async function fetchAllIngredients({ log = () => {}, perCallDelayMs = 350 } = {}) {
  const results = [];

  for (const meta of INGREDIENTS_META) {
    log(`Fetching ${meta.name}…`);
    try {
      const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(meta.query)}&retmode=json&retmax=3&sort=relevance`;
      const search = await fetchJson(searchUrl);
      const pmids = search?.esearchresult?.idlist || [];

      let studies = [];
      if (pmids.length) {
        const summaryUrl = `${BASE_URL}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
        const summary = await fetchJson(summaryUrl);
        const docsums = summary?.result || {};
        for (const pmid of pmids) {
          const doc = docsums[pmid];
          if (!doc?.title) continue;
          const titleLower = doc.title.toLowerCase();
          const isRelevant = meta.aliases.some(a => titleLower.includes(a.toLowerCase()));
          if (!isRelevant) continue;
          studies.push({
            title: doc.title,
            journal: doc.fulljournalname,
            year: doc.pubdate ? doc.pubdate.split(' ')[0] : 'Unknown',
            pubmedId: pmid,
            link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            authors: Array.isArray(doc.authors) && doc.authors.length
              ? doc.authors.slice(0, 3).map(a => a.name).join(', ') + (doc.authors.length > 3 ? ' et al.' : '')
              : 'Unknown',
          });
        }
      }

      results.push({
        id: meta.id,
        name: meta.name,
        evidenceTier: meta.evidenceTier || 1,
        evidenceType: 'Peer-Reviewed Clinical Trials (PubMed)',
        keyStudies: studies,
      });

      if (perCallDelayMs > 0) await new Promise(r => setTimeout(r, perCallDelayMs));
    } catch (err) {
      log(`Error on ${meta.name}: ${err.message}`);
      // Still push an entry (with empty studies) so the ingredient stays in
      // the catalog even when this week's scrape failed for it.
      results.push({
        id: meta.id,
        name: meta.name,
        evidenceTier: meta.evidenceTier || 1,
        evidenceType: 'Peer-Reviewed Clinical Trials (PubMed)',
        keyStudies: [],
      });
    }
  }

  return results;
}

module.exports = { INGREDIENTS_META, fetchAllIngredients };
