const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Use curl because Node's axios/fetch is timing out in this environment
function fetchWithCurl(url) {
  try {
    const output = execSync(`curl -s "${url}"`, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (err) {
    console.error('Curl failed:', err.message);
    return null;
  }
}

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const ingredients = [
  {
    id: 'salicylic_acid',
    name: 'Salicylic Acid',
    aliases: ['salicylic acid', 'BHA', 'beta hydroxy acid'],
    query: '"salicylic acid"[Title/Abstract] AND (acne[Title/Abstract] OR skin[Title/Abstract]) AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])'
  },
  {
    id: 'niacinamide',
    name: 'Niacinamide',
    aliases: ['niacinamide', 'nicotinamide', 'vitamin b3'],
    query: 'niacinamide[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])'
  },
  {
    id: 'tretinoin',
    name: 'Tretinoin',
    aliases: ['tretinoin', 'retinoic acid', 'retinoid'],
    query: 'tretinoin[Title/Abstract] AND (acne[Title/Abstract] OR aging[Title/Abstract] OR wrinkles[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'benzoyl_peroxide',
    name: 'Benzoyl Peroxide',
    aliases: ['benzoyl peroxide'],
    query: '"benzoyl peroxide"[Title/Abstract] AND acne[Title/Abstract] AND clinical trial[ptyp]'
  },
  {
    id: 'hyaluronic_acid',
    name: 'Hyaluronic Acid',
    aliases: ['hyaluronic acid', 'hyaluronate'],
    query: '"hyaluronic acid"[Title/Abstract] AND skin[Title/Abstract] AND (hydration[Title/Abstract] OR moistur*[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'vitamin_c',
    name: 'Vitamin C',
    aliases: ['vitamin c', 'ascorbic acid', 'ascorbate', 'l-ascorbic acid'],
    query: '(ascorbic acid[Title/Abstract] OR "vitamin c"[Title/Abstract]) AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])'
  },
  {
    id: 'azelaic_acid',
    name: 'Azelaic Acid',
    aliases: ['azelaic acid'],
    query: '"azelaic acid"[Title/Abstract] AND (acne[Title/Abstract] OR skin[Title/Abstract] OR rosacea[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'ceramides',
    name: 'Ceramides',
    aliases: ['ceramide', 'ceramides'],
    query: 'ceramide[Title/Abstract] AND skin[Title/Abstract] AND (barrier[Title/Abstract] OR moistur*[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'alpha_arbutin',
    name: 'Alpha Arbutin',
    aliases: ['arbutin', 'alpha arbutin', 'alpha-arbutin'],
    query: 'arbutin[Title/Abstract] AND (skin[Title/Abstract] OR pigment*[Title/Abstract] OR melanin[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'lactic_acid',
    name: 'Lactic Acid',
    aliases: ['lactic acid', 'AHA', 'alpha hydroxy acid'],
    query: '"lactic acid"[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])'
  },
  {
    id: 'glycolic_acid',
    name: 'Glycolic Acid',
    aliases: ['glycolic acid', 'AHA', 'alpha hydroxy acid'],
    query: '"glycolic acid"[Title/Abstract] AND skin[Title/Abstract] AND (clinical trial[ptyp] OR randomized controlled trial[ptyp])'
  },
  {
    id: 'retinol',
    name: 'Retinol',
    aliases: ['retinol', 'vitamin a', 'retinoid'],
    query: 'retinol[Title/Abstract] AND skin[Title/Abstract] AND (aging[Title/Abstract] OR wrinkle*[Title/Abstract] OR anti-aging[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'zinc_oxide',
    name: 'Zinc Oxide',
    aliases: ['zinc oxide', 'zinc'],
    query: '"zinc oxide"[Title/Abstract] AND skin[Title/Abstract] AND (sunscreen[Title/Abstract] OR UV[Title/Abstract] OR acne[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'kojic_acid',
    name: 'Kojic Acid',
    aliases: ['kojic acid'],
    query: '"kojic acid"[Title/Abstract] AND (skin[Title/Abstract] OR pigment*[Title/Abstract] OR whitening[Title/Abstract]) AND clinical trial[ptyp]'
  },
  {
    id: 'peptides',
    name: 'Peptides',
    aliases: ['peptide', 'peptides', 'palmitoyl'],
    query: '(peptide[Title/Abstract] OR palmitoyl[Title/Abstract]) AND skin[Title/Abstract] AND (aging[Title/Abstract] OR collagen[Title/Abstract] OR wrinkle*[Title/Abstract]) AND clinical trial[ptyp]'
  }
];

async function fetchPubMedStudies() {
  console.log("Starting to scrape legitimate PubMed research papers...\n");
  const results = [];

  for (const ingredient of ingredients) {
    console.log(`Fetching studies for ${ingredient.name}...`);
    try {
      // 1. Search for PMIDs
      const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(ingredient.query)}&retmode=json&retmax=3&sort=relevance`;
      const searchData = fetchWithCurl(searchUrl);

      if (!searchData || !searchData.esearchresult) {
        console.log(`Failed to fetch or parse search for ${ingredient.name}`);
        continue;
      }

      const pmids = searchData.esearchresult.idlist || [];
      
      if (pmids.length === 0) {
        console.log(`No studies found for ${ingredient.name}`);
        continue;
      }

      // 2. Fetch details for these PMIDs
      const summaryUrl = `${BASE_URL}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
      const summaryData = fetchWithCurl(summaryUrl);

      if (!summaryData || !summaryData.result) {
        console.log(`Failed to fetch summaries for ${ingredient.name}`);
        continue;
      }

      const studies = [];
      const docsums = summaryData.result;

      for (const pmid of pmids) {
        const doc = docsums[pmid];
        if (!doc || !doc.title) continue;

        // Validate: ingredient name or one of its aliases must appear in title
        const titleLower = doc.title.toLowerCase();
        const isRelevant = ingredient.aliases.some(alias => titleLower.includes(alias.toLowerCase()));
        if (!isRelevant) {
          console.log(`  Skipping PMID ${pmid}: title "${doc.title}" doesn't mention ${ingredient.name}`);
          continue;
        }

        studies.push({
          title: doc.title,
          journal: doc.fulljournalname,
          year: doc.pubdate ? doc.pubdate.split(' ')[0] : 'Unknown',
          pubmedId: pmid,
          link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          authors: doc.authors && doc.authors.length > 0
            ? doc.authors.slice(0, 3).map(a => a.name).join(', ') + (doc.authors.length > 3 ? ' et al.' : '')
            : 'Unknown'
        });
      }

      results.push({
        id: ingredient.id,
        name: ingredient.name,
        evidenceTier: 1,
        evidenceType: "Peer-Reviewed Clinical Trials (PubMed)",
        keyStudies: studies
      });

      // Be polite to NCBI API (wait a bit so we don't spam curl commands too fast)
      await new Promise(resolve => setTimeout(resolve, 500)); 

    } catch (error) {
      console.error(`Error processing ${ingredient.name}:`, error.message);
    }
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Save to JSON
  const outputPath = path.join(dataDir, 'ingredients.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Successfully scraped and saved ${results.length} ingredient profiles to ${outputPath}`);
}

fetchPubMedStudies();
