document.addEventListener('DOMContentLoaded', () => {
  const regionSelect = document.getElementById('region-select');
  const loadingIndicator = document.getElementById('loading-indicator');
  const routineContent = document.getElementById('routine-content');
  const noAnalysisWarning = document.getElementById('no-analysis-warning');
  const userConcernsList = document.getElementById('user-concerns-list');
  const userSkinType = document.getElementById('user-skin-type');

  // Amazon Regions Data
  const amazonRegions = {
    "US": { tld: "com", tag: "dermai-us-20", name: "United States" },
    "CA": { tld: "ca", tag: "dermai-ca-20", name: "Canada" },
    "UK": { tld: "co.uk", tag: "dermai-uk-21", name: "United Kingdom" },
    "DE": { tld: "de", tag: "dermai-de-21", name: "Germany" },
    "FR": { tld: "fr", tag: "dermai-fr-21", name: "France" },
    "IT": { tld: "it", tag: "dermai-it-21", name: "Italy" },
    "ES": { tld: "es", tag: "dermai-es-21", name: "Spain" },
    "NL": { tld: "nl", tag: "dermai-nl-21", name: "Netherlands" },
    "SE": { tld: "se", tag: "dermai-se-21", name: "Sweden" },
    "PL": { tld: "pl", tag: "dermai-pl-21", name: "Poland" },
    "IN": { tld: "in", tag: "dermai-in-21", name: "India" },
    "JP": { tld: "co.jp", tag: "dermai-jp-22", name: "Japan" },
    "AU": { tld: "com.au", tag: "dermai-au-22", name: "Australia" },
    "SG": { tld: "sg", tag: "dermai-sg-22", name: "Singapore" },
    "AE": { tld: "ae", tag: "dermai-ae-21", name: "United Arab Emirates" },
    "SA": { tld: "sa", tag: "dermai-sa-21", name: "Saudi Arabia" },
    "MX": { tld: "com.mx", tag: "dermai-mx-20", name: "Mexico" },
    "BR": { tld: "com.br", tag: "dermai-br-20", name: "Brazil" }
  };

  let allProducts = [];
  let allIngredients = [];
  let allConcerns = {};
  let userAnalysis = null;

  async function init() {
    Object.keys(amazonRegions).forEach(code => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = amazonRegions[code].name;
      regionSelect.appendChild(option);
    });

    const savedData = localStorage.getItem('dermAI_analysis');
    if (!savedData) {
      noAnalysisWarning.classList.remove('hidden');
      return;
    }
    
    userAnalysis = JSON.parse(savedData);
    
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let defaultRegion = "US";
    if (tz.includes('Europe')) defaultRegion = "UK";
    if (tz.includes('India')) defaultRegion = "IN";
    if (tz.includes('Australia')) defaultRegion = "AU";
    if (tz.includes('Tokyo')) defaultRegion = "JP";
    regionSelect.value = defaultRegion;

    renderUserConcerns();

    loadingIndicator.classList.remove('hidden');
    try {
      const [prodRes, ingRes, conRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/ingredients'),
        fetch('/api/concerns')
      ]);

      if (!prodRes.ok || !ingRes.ok || !conRes.ok) throw new Error("API returned non-200");

      allProducts = await prodRes.json();
      allIngredients = await ingRes.json();
      allConcerns = await conRes.json();

      filterAndRenderProducts();
      fetchWeatherAndUV();
    } catch (err) {
      console.error("Failed to load DB", err);
      // Fallback message
      document.querySelector('.routine-timeline').innerHTML = '<p class="error" style="text-align: center;">Failed to connect to database. Ensure backend is running.</p>';
    } finally {
      loadingIndicator.classList.add('hidden');
      routineContent.classList.remove('hidden');
    }
  }

  function renderUserConcerns() {
    userSkinType.textContent = userAnalysis.skinType || 'Unknown';
    userConcernsList.innerHTML = '';
    if (userAnalysis.concerns && userAnalysis.concerns.length > 0) {
      userAnalysis.concerns.forEach(c => {
        const li = document.createElement('li');
        li.className = 'concern-tag';
        li.textContent = c.name;
        userConcernsList.appendChild(li);
      });
    }
  }

  // Rank products: highest (max concern severity × ingredient evidenceTier) first
  function rankProducts(products) {
    return [...products].sort((a, b) => {
      const scoreFor = (prod) => {
        const ing = allIngredients.find(i => i.id === prod.primaryIngredientId);
        const tier = ing ? ing.evidenceTier : 1;
        const maxSeverity = userAnalysis.concerns
          .filter(c => prod.concerns.includes(c.name))
          .reduce((max, c) => Math.max(max, c.severity || 0), 0);
        return maxSeverity * tier;
      };
      return scoreFor(b) - scoreFor(a);
    });
  }

  function filterAndRenderProducts() {
    const selectedRegionCode = regionSelect.value;
    const selectedRegionData = amazonRegions[selectedRegionCode];
    const userConcernNames = userAnalysis.concerns.map(c => c.name);

    // Filter treatments to only those matching user concerns
    const matchedTreatments = rankProducts(
      allProducts.filter(p => p.category === 'treatment' && p.concerns.some(pc => userConcernNames.includes(pc)))
    );

    const cleansers = rankProducts(allProducts.filter(p => p.category === 'cleanser'));
    const moisturizers = rankProducts(allProducts.filter(p => p.category === 'moisturizer'));
    const sunscreens = rankProducts(allProducts.filter(p => p.category === 'sunscreen'));

    // Split treatments by time of day
    const amTreatments = matchedTreatments.filter(p => p.bestTimeOfDay === 'AM' || p.bestTimeOfDay === 'both');
    const pmTreatments = matchedTreatments.filter(p => p.bestTimeOfDay === 'PM' || p.bestTimeOfDay === 'both');

    // AM moisturizers preferred; PM moisturizers for evening repair
    const amMoisturizers = moisturizers.filter(p => p.bestTimeOfDay === 'AM' || p.bestTimeOfDay === 'both');
    const pmMoisturizers = moisturizers.filter(p => p.bestTimeOfDay === 'PM' || p.bestTimeOfDay === 'both');

    renderStep('am-cleanser', 'Step 1: Cleanser', cleansers, selectedRegionData);
    renderStep('am-treatment', 'Step 2: Treatment', amTreatments, selectedRegionData);
    renderStep('am-moisturizer', 'Step 3: Moisturizer', amMoisturizers.length ? amMoisturizers : moisturizers, selectedRegionData);
    renderStep('am-sunscreen', 'Step 4: Sunscreen', sunscreens, selectedRegionData);

    renderStep('pm-cleanser', 'Step 1: Cleanser', cleansers, selectedRegionData);
    renderStep('pm-treatment', 'Step 2: Treatment', pmTreatments, selectedRegionData);
    renderStep('pm-moisturizer', 'Step 3: Moisturizer', pmMoisturizers.length ? pmMoisturizers : moisturizers, selectedRegionData);
  }

  function buildEvidenceHTML(prod, ingredient) {
    const userConcernNames = userAnalysis.concerns.map(c => c.name);
    const matchedConcerns = prod.concerns.filter(pc => userConcernNames.includes(pc));
    if (!matchedConcerns.length || !ingredient) return '';

    // Find the first PubMed study for this ingredient
    const study = ingredient.keyStudies && ingredient.keyStudies[0];
    const studyLink = study
      ? `<a href="${study.link}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-400); text-decoration:underline;">[PMID ${study.pubmedId}]</a>`
      : '';

    // Build rationale from concerns.json
    const rationales = matchedConcerns
      .map(cn => allConcerns[cn] && allConcerns[cn].targetIngredients.includes(prod.primaryIngredientId) ? allConcerns[cn].rationale : null)
      .filter(Boolean);

    if (!rationales.length && !studyLink) return '';

    const rationaleText = rationales[0] || `${ingredient.name} is clinically studied for ${matchedConcerns.join(', ')}.`;

    return `
      <div style="margin-top:0.75rem; padding:0.75rem; background:rgba(99,102,241,0.08); border-radius:8px; border-left:3px solid var(--primary-500);">
        <p style="font-size:0.75rem; color:var(--primary-300); font-weight:600; margin-bottom:0.25rem;">WHY THIS?</p>
        <p style="font-size:0.8rem; color:var(--neutral-300); line-height:1.5;">${rationaleText} ${studyLink}</p>
      </div>`;
  }

  function buildProductCardHTML(prod, regionData) {
    const ingredient = allIngredients.find(ing => ing.id === prod.primaryIngredientId);
    const evidenceTier = ingredient ? ingredient.evidenceTier : '?';
    const searchQuery = encodeURIComponent(`${prod.brand} ${prod.name}`);
    const buyURL = `https://www.amazon.${regionData.tld}/s?k=${searchQuery}`;
    const evidenceHTML = buildEvidenceHTML(prod, ingredient);

    return `
      <div class="step-details">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h3 style="color:var(--primary-300); font-size:1rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:0.25rem;">${prod.brand}</h3>
          <span class="badge badge-tier-${evidenceTier}" style="font-size:0.7rem;">${evidenceTier === 1 ? '🏆 Tier 1 RCT' : '✅ Tier 2'}</span>
        </div>
        <p style="font-size:1.5rem; font-weight:600; font-family:var(--font-display); line-height:1.2; margin-bottom:0.75rem;">${prod.name}</p>
        <p style="font-size:0.875rem; color:var(--neutral-300);"><strong style="color:var(--neutral-100);">Active:</strong> ${ingredient ? ingredient.name : prod.primaryIngredientId}</p>
        <p style="font-size:0.875rem; color:var(--neutral-300); margin-top:0.25rem;"><strong style="color:var(--neutral-100);">Treats:</strong> ${prod.concerns.filter(c => userAnalysis.concerns.map(uc => uc.name).includes(c)).join(', ') || prod.concerns.join(', ')}</p>
        ${evidenceHTML}
      </div>
      <div class="step-actions" style="margin-top:1rem;">
        <a href="${buyURL}" target="_blank" rel="noopener noreferrer" class="btn buy-btn" style="width:100%;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.5rem;"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          Search on Amazon
        </a>
        <p style="font-size:0.7rem; color:var(--neutral-500); text-align:center; margin-top:0.5rem;">Search link only — not affiliated</p>
      </div>`;
  }

  function renderStep(containerId, label, products, regionData) {
    const container = document.getElementById(containerId);
    if (!products || products.length === 0) {
      container.innerHTML = `<div class="step-label">${label}</div><p style="color:var(--neutral-400); margin-top:1.5rem; padding-left:0.5rem;">No matching products found.</p>`;
      return;
    }

    const prod = products[0];
    let selectHTML = '';
    if (products.length > 1) {
      selectHTML = `<select class="product-picker" onchange="window.updateStep('${containerId}', this.value, '${regionData.tld}')">`;
      products.forEach(p => {
        selectHTML += `<option value="${p.id}">${p.brand} — ${p.name}</option>`;
      });
      selectHTML += `</select>`;
    }

    container.innerHTML = `
      <div class="step-label">${label}</div>
      <div style="margin-top: 1.5rem;">
        ${selectHTML}
        <div class="step-content glass-panel" id="${containerId}-content">
          ${buildProductCardHTML(prod, regionData)}
        </div>
      </div>`;
  }

  window.updateStep = function(containerId, prodId, tld) {
    const prod = allProducts.find(p => p.id === prodId);
    if (!prod) return;
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || { tld };
    document.getElementById(`${containerId}-content`).innerHTML = buildProductCardHTML(prod, regionData);
  };

  async function fetchWeatherAndUV() {
    try {
      const ipRes = await fetch('https://ipapi.co/json/');
      const loc = await ipRes.json();
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,uv_index`);
      const weather = await weatherRes.json();
      const current = weather.current;
      
      const weatherDiv = document.getElementById('weather-widget');
      weatherDiv.innerHTML = `
        <div class="glass-panel" style="padding: 1.5rem; margin-bottom: 2rem;">
          <h4 style="margin-bottom:0.5rem; color:var(--primary-300);">🌤️ Local Climate Context (${loc.city || 'Your Location'})</h4>
          <div style="display:flex; gap:2rem; flex-wrap:wrap; margin-top:1rem;">
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Current UV Index</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.uv_index} ${current.uv_index > 5 ? '<span style="color:#f87171; font-size:1rem;">(High! Apply Extra SPF)</span>' : '<span style="color:var(--primary-400); font-size:1rem;">(Safe)</span>'}</p>
            </div>
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Relative Humidity</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.relative_humidity_2m}% ${current.relative_humidity_2m < 40 ? '<span style="color:#f87171; font-size:1rem;">(Dry! Hydrate)</span>' : ''}</p>
            </div>
          </div>
        </div>
      `;
      weatherDiv.classList.remove('hidden');
    } catch (err) {
      console.error("Weather fetch failed", err);
    }
  }

  regionSelect.addEventListener('change', () => {
    filterAndRenderProducts();
  });

  init();
});
