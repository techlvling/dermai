document.addEventListener('DOMContentLoaded', () => {
  const loadingIndicator = document.getElementById('loading-indicator');
  const routineContent = document.getElementById('routine-content');
  const noAnalysisWarning = document.getElementById('no-analysis-warning');
  const userConcernsList = document.getElementById('user-concerns-list');
  const userSkinType = document.getElementById('user-skin-type');
  const detectedRegionEl = document.getElementById('detected-region');

  // Amazon Regions Data — fill in `tag` per region as you get approved on each Amazon Associates programme
  const amazonRegions = {
    "US": { tld: "com",     tag: "", name: "United States" },
    "CA": { tld: "ca",      tag: "", name: "Canada" },
    "UK": { tld: "co.uk",   tag: "", name: "United Kingdom" },
    "DE": { tld: "de",      tag: "", name: "Germany" },
    "FR": { tld: "fr",      tag: "", name: "France" },
    "IT": { tld: "it",      tag: "", name: "Italy" },
    "ES": { tld: "es",      tag: "", name: "Spain" },
    "NL": { tld: "nl",      tag: "", name: "Netherlands" },
    "SE": { tld: "se",      tag: "", name: "Sweden" },
    "PL": { tld: "pl",      tag: "", name: "Poland" },
    "IN": { tld: "in",      tag: "tinkref-21", name: "India" },
    "JP": { tld: "co.jp",   tag: "", name: "Japan" },
    "AU": { tld: "com.au",  tag: "", name: "Australia" },
    "SG": { tld: "sg",      tag: "", name: "Singapore" },
    "AE": { tld: "ae",      tag: "", name: "United Arab Emirates" },
    "SA": { tld: "sa",      tag: "", name: "Saudi Arabia" },
    "MX": { tld: "com.mx",  tag: "", name: "Mexico" },
    "BR": { tld: "com.br",  tag: "", name: "Brazil" }
  };

  // ISO country code → amazonRegions key
  const COUNTRY_TO_REGION = {
    US: 'US', CA: 'CA', GB: 'UK', DE: 'DE', FR: 'FR',
    IT: 'IT', ES: 'ES', NL: 'NL', SE: 'SE', PL: 'PL',
    IN: 'IN', JP: 'JP', AU: 'AU', SG: 'SG',
    AE: 'AE', SA: 'SA', MX: 'MX', BR: 'BR'
  };

  let allProducts = [];
  let allIngredients = [];
  let allConcerns = {};
  let userAnalysis = null;
  let userLocation = null; // shared between region detection + weather widget
  let currentRegionCode = 'US';

  // ── Persistence helpers ──────────────────────────────────────────────
  function sGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function sSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  const ROUTINE_SLOTS = [
    { id: 'am-cleanser',    slot: 'am', key: 'cleanser'    },
    { id: 'am-treatment',   slot: 'am', key: 'treatment'   },
    { id: 'am-moisturizer', slot: 'am', key: 'moisturizer' },
    { id: 'am-sunscreen',   slot: 'am', key: 'sunscreen'   },
    { id: 'pm-cleanser',    slot: 'pm', key: 'cleanser'    },
    { id: 'pm-treatment',   slot: 'pm', key: 'treatment'   },
    { id: 'pm-moisturizer', slot: 'pm', key: 'moisturizer' },
  ];

  async function detectRegionByIP() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      userLocation = await res.json();
      const code = (userLocation.country_code || '').toUpperCase();
      return COUNTRY_TO_REGION[code] || fallbackByTimezone();
    } catch (err) {
      console.warn('IP geolocation failed, falling back to timezone', err);
      return fallbackByTimezone();
    }
  }

  function fallbackByTimezone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Kolkata') || tz.includes('India')) return 'IN';
    if (tz.includes('London') || tz.includes('Europe/London')) return 'UK';
    if (tz.includes('Europe')) return 'DE';
    if (tz.includes('Australia')) return 'AU';
    if (tz.includes('Tokyo')) return 'JP';
    if (tz.includes('Singapore')) return 'SG';
    return 'US';
  }

  async function init() {
    const savedData = localStorage.getItem('dermAI_analysis');
    if (!savedData) {
      noAnalysisWarning.classList.remove('hidden');
      return;
    }

    userAnalysis = JSON.parse(savedData);

    // Show staleness banner if analysis is older than 30 days
    const savedAt = userAnalysis.savedAt;
    if (savedAt) {
      const ageDays = (Date.now() - savedAt) / (1000 * 60 * 60 * 24);
      if (ageDays > 30) {
        const banner = document.getElementById('stale-banner');
        if (banner) {
          banner.classList.remove('hidden');
          banner.innerHTML = `
            <span>Your skin analysis is ${Math.floor(ageDays)} days old. Results may no longer reflect your current skin.</span>
            <a href="/analyze.html">Re-analyze</a>
            <button class="stale-banner-dismiss" aria-label="Dismiss">&#x2715;</button>`;
          banner.querySelector('.stale-banner-dismiss').addEventListener('click', () => {
            banner.classList.add('hidden');
          });
        }
      }
    }

    renderUserConcerns();

    loadingIndicator.classList.remove('hidden');
    try {
      const [regionCode, prodRes, ingRes, conRes] = await Promise.all([
        detectRegionByIP(),
        fetch('/api/products'),
        fetch('/api/ingredients'),
        fetch('/api/concerns')
      ]);

      if (!prodRes.ok || !ingRes.ok || !conRes.ok) throw new Error('API returned non-200');

      currentRegionCode = regionCode;
      allProducts = await prodRes.json();
      allIngredients = await ingRes.json();
      allConcerns = await conRes.json();

      const region = amazonRegions[currentRegionCode];
      if (detectedRegionEl) {
        detectedRegionEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Showing products on amazon.${region.tld} (${region.name}).`;
      }

      filterAndRenderProducts();
      initChecklist();
      renderHeatmap();
      renderBadges();
      renderWeatherFromLocation();
    } catch (err) {
      console.error('Failed to load DB', err);
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
    const selectedRegionData = amazonRegions[currentRegionCode];
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
      <div class="evidence-rationale">
        <p class="evidence-rationale-label">WHY THIS?</p>
        <p class="evidence-rationale-body">${rationaleText} ${studyLink}</p>
      </div>`;
  }

  function buildProductCardHTML(prod, regionData) {
    const ingredient = allIngredients.find(ing => ing.id === prod.primaryIngredientId);
    const evidenceTier = ingredient ? ingredient.evidenceTier : '?';
    const searchQuery = encodeURIComponent(`${prod.brand} ${prod.name}`);
    // Append Amazon Associates tag if one is configured for this region
    const tagParam = regionData.tag ? `&tag=${regionData.tag}` : '';
    const buyURL = `https://www.amazon.${regionData.tld}/s?k=${searchQuery}${tagParam}`;
    const evidenceHTML = buildEvidenceHTML(prod, ingredient);
    const savedFavs = sGet('dermAI_favorites') || [];
    const isFav = savedFavs.includes(prod.id);

    return `
      <div class="step-details">
        <div class="prod-header">
          <p class="prod-brand">${prod.brand}</p>
          <span class="badge badge-tier-${evidenceTier}">${evidenceTier === 1 ? 'Tier 1 RCT' : 'Tier 2'}</span>
        </div>
        <p class="prod-name">${prod.name}</p>
        <p class="prod-meta"><strong>Active:</strong> ${ingredient ? ingredient.name : prod.primaryIngredientId}</p>
        <p class="prod-meta"><strong>Treats:</strong> ${prod.concerns.filter(c => userAnalysis.concerns.map(uc => uc.name).includes(c)).join(', ') || prod.concerns.join(', ')}</p>
        ${evidenceHTML}
      </div>
      <div class="step-actions">
        <button class="fav-btn${isFav ? ' fav-active' : ''}" onclick="window.toggleFavorite('${prod.id}', this)" aria-pressed="${isFav}" aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${isFav ? 'SAVED' : 'SAVE'}
        </button>
        <a href="${buyURL}" target="_blank" rel="sponsored noopener noreferrer" class="btn buy-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          Search on Amazon
        </a>
        <p class="prod-disclosure">Affiliate link — DermAI may earn from qualifying purchases.</p>
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

  // ── Checklist ────────────────────────────────────────────────────────
  function initChecklist() {
    const log = sGet('dermAI_routineLog') || {};
    const today = todayKey();
    const todayLog = log[today] || {};
    ROUTINE_SLOTS.forEach(({ id, slot, key }) => {
      const container = document.getElementById(id);
      if (!container) return;
      const content = container.querySelector('.step-content');
      if (!content) return;
      const checked = !!(todayLog[slot] && todayLog[slot][key]);
      const btn = document.createElement('button');
      btn.className = 'step-check-btn' + (checked ? ' checked' : '');
      btn.setAttribute('aria-pressed', String(checked));
      btn.setAttribute('aria-label', checked ? 'Unmark step' : 'Mark step done');
      btn.innerHTML = checked
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> DONE'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg> MARK DONE';
      btn.addEventListener('click', () => onCheckClick(slot, key, btn));
      content.appendChild(btn);
    });
    renderStreak();
  }

  function onCheckClick(slot, key, btn) {
    const log = sGet('dermAI_routineLog') || {};
    const today = todayKey();
    if (!log[today]) log[today] = {};
    if (!log[today][slot]) log[today][slot] = {};
    log[today][slot][key] = !log[today][slot][key];
    sSet('dermAI_routineLog', log);
    const checked = log[today][slot][key];
    btn.className = 'step-check-btn' + (checked ? ' checked' : '');
    btn.setAttribute('aria-pressed', String(checked));
    btn.setAttribute('aria-label', checked ? 'Unmark step' : 'Mark step done');
    btn.innerHTML = checked
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> DONE'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg> MARK DONE';
    renderStreak();
    renderHeatmap();
    renderBadges();
  }

  function computeStreak() {
    const log = sGet('dermAI_routineLog') || {};
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const dayLog = log[k];
      const hasAny = dayLog && Object.values(dayLog).some(slotObj => Object.values(slotObj).some(Boolean));
      if (hasAny) {
        streak++;
      } else if (i === 0) {
        continue; // today not started yet — skip, check yesterday
      } else {
        break;
      }
    }
    return streak;
  }

  function renderStreak() {
    const el = document.getElementById('streak-counter');
    if (!el) return;
    const streak = computeStreak();
    if (streak === 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>&nbsp;<strong>${streak}</strong>&nbsp;day streak`;
  }

  function renderHeatmap() {
    const container = document.getElementById('adherence-heatmap');
    if (!container) return;
    const log = sGet('dermAI_routineLog') || {};
    const TOTAL = 7;
    const now = new Date();
    let cells = '';
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const dayLog = log[k];
      const done = dayLog
        ? Object.values(dayLog).reduce((s, sl) => s + Object.values(sl).filter(Boolean).length, 0)
        : 0;
      const lvl = done === 0 ? 0 : done < 3 ? 1 : done < 6 ? 2 : 3;
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      cells += `<div class="heatmap-cell level-${lvl}" title="${label}: ${done}/${TOTAL} steps"></div>`;
    }
    container.innerHTML = `
      <span class="section-eyebrow">30-DAY ADHERENCE</span>
      <div class="heatmap-grid">${cells}</div>
      <div class="heatmap-legend">
        <span>Less</span>
        <div class="heatmap-cell level-0"></div>
        <div class="heatmap-cell level-1"></div>
        <div class="heatmap-cell level-2"></div>
        <div class="heatmap-cell level-3"></div>
        <span>More</span>
      </div>`;
    container.classList.remove('hidden');
  }

  const BADGE_DEFS = [
    { id: 'first-scan', label: 'FIRST SCAN',    check: ()     => true },
    { id: '3-day',      label: '3 DAY STREAK',  check: (s)    => s >= 3 },
    { id: '7-day',      label: 'WEEK STREAK',   check: (s)    => s >= 7 },
    { id: '30-day',     label: '30 DAY STREAK', check: (s)    => s >= 30 },
    { id: '5-faves',    label: '5 FAVORITES',   check: (s, f) => f >= 5 },
  ];

  function renderBadges() {
    const el = document.getElementById('badges-row');
    if (!el) return;
    const streak = computeStreak();
    const favCount = (sGet('dermAI_favorites') || []).length;
    const earned = sGet('dermAI_earnedBadges') || [];
    BADGE_DEFS.forEach(def => {
      if (def.check(streak, favCount) && !earned.includes(def.id)) earned.push(def.id);
    });
    sSet('dermAI_earnedBadges', earned);
    const earnedDefs = BADGE_DEFS.filter(d => earned.includes(d.id));
    if (!earnedDefs.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<span class="section-eyebrow">ACHIEVEMENTS</span><div class="badges-grid">${
      earnedDefs.map(b => `<div class="badge-item">${b.label}</div>`).join('')
    }</div>`;
  }

  window.toggleFavorite = function (prodId, btn) {
    const favs = sGet('dermAI_favorites') || [];
    const idx = favs.indexOf(prodId);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(prodId);
    sSet('dermAI_favorites', favs);
    const isFav = favs.includes(prodId);
    btn.className = 'fav-btn' + (isFav ? ' fav-active' : '');
    btn.setAttribute('aria-pressed', String(isFav));
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Save to favorites');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${isFav ? 'SAVED' : 'SAVE'}`;
    renderBadges();
  };

  window.updateStep = function(containerId, prodId, tld) {
    const prod = allProducts.find(p => p.id === prodId);
    if (!prod) return;
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || { tld };
    document.getElementById(`${containerId}-content`).innerHTML = buildProductCardHTML(prod, regionData);
  };

  async function renderWeatherFromLocation() {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) return;
    try {
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&current=temperature_2m,relative_humidity_2m,uv_index`);
      const weather = await weatherRes.json();
      const current = weather.current;

      const weatherDiv = document.getElementById('weather-widget');
      weatherDiv.innerHTML = `
        <div class="glass-panel" style="padding: 1.5rem; margin-bottom: 2rem;">
          <h4 style="margin-bottom:0.5rem; color:var(--primary-300);">🌤️ Local Climate Context (${userLocation.city || 'Your Location'})</h4>
          <div style="display:flex; gap:2rem; flex-wrap:wrap; margin-top:1rem;">
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Current UV Index</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.uv_index} ${current.uv_index > 5 ? '<span style="color:var(--primary-700); font-size:1rem;">(High! Apply Extra SPF)</span>' : '<span style="color:#2a8a64; font-size:1rem;">(Safe)</span>'}</p>
            </div>
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Relative Humidity</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.relative_humidity_2m}% ${current.relative_humidity_2m < 40 ? '<span style="color:var(--primary-700); font-size:1rem;">(Dry! Hydrate)</span>' : ''}</p>
            </div>
          </div>
        </div>
      `;
      weatherDiv.classList.remove('hidden');
    } catch (err) {
      console.error("Weather fetch failed", err);
    }
  }

  init();
});
