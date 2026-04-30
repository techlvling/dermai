// Manual PubMed evidence refresh — writes to backend/data/ingredients.json.
// For local development. The weekly Vercel cron uses the same scraper
// (backend/lib/pubmed-fetcher.js) but writes to the evidence_cache DB row
// instead because Vercel's runtime filesystem is read-only.
//
// Usage:
//   node backend/scripts/fetchPubMed.js
const fs = require('fs');
const path = require('path');
const { fetchAllIngredients } = require('../lib/pubmed-fetcher');

(async () => {
  console.log('Starting PubMed scrape (writes to backend/data/ingredients.json)...');
  const results = await fetchAllIngredients({
    log: msg => console.log(' ' + msg),
    perCallDelayMs: 500,
  });
  const outputPath = path.join(__dirname, '..', 'data', 'ingredients.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  const totalStudies = results.reduce((s, i) => s + i.keyStudies.length, 0);
  console.log(`\nDone — wrote ${results.length} ingredients with ${totalStudies} studies to ${outputPath}`);
})();
