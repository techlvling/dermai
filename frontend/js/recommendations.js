document.addEventListener('DOMContentLoaded', () => {
  // #routine-loading-indicator avoids collision with ingredients.js's
  // #loading-indicator when both scripts run on dashboard.html.
  const loadingIndicator = document.getElementById('routine-loading-indicator');
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
  let allConflicts = [];
  let userProducts = [];   // BYO products owned by the user (from /api/user-products)
  let slotChoices = {};    // today's per-slot product choice: {am:{key:{source,id}}, pm:{...}}
  let userAnalysis = null;
  let userLocation = null; // shared between region detection + weather widget
  let currentRegionCode = 'US';

  // ── Persistence helpers ──────────────────────────────────────────────
  function sGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function sSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // Fetch the user's own product catalog. Silent on auth/network failure —
  // anonymous users simply don't see "Yours" entries in routine slots.
  async function loadUserProducts() {
    if (!window.Storage || !Storage.server) return;
    if (!(await Storage.isLoggedIn())) return;
    try {
      const body = await Storage.server.get('/api/user-products');
      if (body && Array.isArray(body.products)) userProducts = body.products;
    } catch (_) { /* silent */ }
  }

  // Project a user_products row into the catalog's product shape so it can
  // flow through the same renderStep / buildProductCardHTML pipeline.
  function projectUserProduct(p) {
    return {
      id: p.id,
      brand: p.brand || 'My product',
      name: p.name,
      category: p.category,
      bestTimeOfDay: p.best_time_of_day,
      primaryIngredientId: (p.ingredients && p.ingredients[0]) || null,
      concerns: [],
      _source: 'user',
    };
  }

  // Filter user products that fit a given slot (e.g. AM cleanser, PM treatment).
  function userProductsFor(category, time) {
    return userProducts
      .filter(p => p.category === category && (p.best_time_of_day === time || p.best_time_of_day === 'both'))
      .map(projectUserProduct);
  }

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
    // Timezone first — it's instant and works offline. ipapi.co was failing
    // on iOS Safari (CORS / ITP), and even when it worked it could be wrong
    // (mobile carrier IPs sometimes geo-locate to the carrier's HQ country).
    // Default is now 'IN' (India) since this is our primary market — fall
    // back to ipapi only if the local timezone doesn't tell us anything.
    const fromTz = fallbackByTimezone();
    if (fromTz) return fromTz;

    try {
      const res = await fetch('https://ipapi.co/json/');
      userLocation = await res.json();
      const code = (userLocation.country_code || '').toUpperCase();
      return COUNTRY_TO_REGION[code] || 'IN';
    } catch (err) {
      console.warn('IP geolocation failed, defaulting to IN', err);
      return 'IN';
    }
  }

  function fallbackByTimezone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    // India: both 'Asia/Kolkata' (modern IANA) and 'Asia/Calcutta' (legacy)
    // resolve to IST. iOS sometimes still reports 'Asia/Calcutta'.
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) return 'IN';
    if (tz.includes('London')) return 'UK';
    if (tz.includes('Australia')) return 'AU';
    if (tz.includes('Tokyo')) return 'JP';
    if (tz.includes('Singapore')) return 'SG';
    if (tz.includes('Dubai') || tz.includes('Abu_Dhabi')) return 'AE';
    if (tz.includes('Riyadh')) return 'SA';
    if (tz.includes('Europe')) return 'DE'; // generic European fallback
    if (tz.includes('America/Toronto') || tz.includes('America/Vancouver') || tz.includes('America/Halifax')) return 'CA';
    if (tz.includes('America')) return 'US';
    return null; // ambiguous (UTC, etc) — let ipapi try
  }

  async function init() {
    // Source-of-truth: when logged in, prefer the server's most-recent scan.
    // BUT if the server is empty AND localStorage has fresh data (within the
    // last hour), trust localStorage with a "sync pending" badge. This fixes
    // the regression where a /api/scans POST failure on iOS destroyed the
    // user's just-finished scan and the routine page showed no-analysis.
    const loggedIn = window.Storage ? await Storage.isLoggedIn() : false;
    const FRESH_LOCAL_MS = 60 * 60 * 1000; // 1 hour

    function readLocal() {
      const raw = localStorage.getItem('dermAI_analysis');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    }

    function isFresh(local) {
      if (!local || !local.savedAt) return false;
      return (Date.now() - local.savedAt) < FRESH_LOCAL_MS;
    }

    let syncPending = false;

    if (loggedIn) {
      const latest = await Storage.fetchLatestScan();
      if (latest) {
        userAnalysis = latest.result_json;
        localStorage.setItem('dermAI_analysis', JSON.stringify({ ...userAnalysis, savedAt: userAnalysis.savedAt || Date.now() }));
      } else {
        // Server is empty. If localStorage has a recent unsynced scan,
        // trust it — the POST probably failed in flight. Otherwise show CTA.
        const local = readLocal();
        if (isFresh(local)) {
          userAnalysis = local;
          syncPending = true;
        } else {
          noAnalysisWarning.classList.remove('hidden');
          // Stale local cache — prune so badges/streak don't disagree.
          if (local) localStorage.removeItem('dermAI_analysis');
          return;
        }
      }
    } else {
      const savedData = localStorage.getItem('dermAI_analysis');
      if (!savedData) {
        noAnalysisWarning.classList.remove('hidden');
        return;
      }
      userAnalysis = JSON.parse(savedData);
    }

    if (syncPending) {
      const banner = document.createElement('div');
      banner.className = 'sync-pending-banner';
      banner.style.cssText = 'margin-bottom:1rem; padding:0.75rem 1rem; background:rgba(255,170,122,0.12); border:1px solid rgba(255,170,122,0.35); border-radius:var(--radius-md,12px); font-size:0.78rem; color:#9a5416;';
      banner.innerHTML = '⚠ This scan hasn\'t synced to your account yet. <button id="sync-retry" style="background:none;border:none;color:var(--primary-700);text-decoration:underline;cursor:pointer;font-weight:600;">Retry sync</button>';
      const target = document.getElementById('routine-content') || document.body;
      target.prepend(banner);
      document.getElementById('sync-retry')?.addEventListener('click', async () => {
        if (!Storage.server) return;
        const r = await Storage.server.post('/api/scans', { result_json: userAnalysis });
        if (r?.scan?.id) {
          banner.innerHTML = '✓ Synced!';
          setTimeout(() => banner.remove(), 1500);
        } else {
          banner.querySelector('button').textContent = 'Sync failed — try again';
        }
      });
    }

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
      const [regionCode, prodRes, ingRes, conRes, conflRes] = await Promise.all([
        detectRegionByIP(),
        fetch('/api/products'),
        fetch('/api/ingredients'),
        fetch('/api/concerns'),
        fetch('/api/conflicts')
      ]);

      if (!prodRes.ok || !ingRes.ok || !conRes.ok) throw new Error('API returned non-200');

      currentRegionCode = regionCode;
      allProducts    = await prodRes.json();
      allIngredients = await ingRes.json();
      allConcerns    = await conRes.json();
      allConflicts   = conflRes.ok ? await conflRes.json() : [];

      const region = amazonRegions[currentRegionCode];
      if (detectedRegionEl) {
        detectedRegionEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Showing products on amazon.${region.tld} (${region.name}).`;
      }

      await loadUserProducts();
      filterAndRenderProducts();
      initChecklist();
      initRangeToggle(); // also calls renderStats + renderHeatmap with current range
      renderBadges();
      detectAndRenderConflicts();
      initPatchTest();
      checkReorderReminders();
      renderWeatherFromLocation();
      initPhotoTimeline();
      initDiary();
      initNotifications();
      hydrateRoutineFromServer();
      hydrateDiaryFromServer();
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

    // Merge user products into each slot pool — user picks show first so the
    // tube they own is the visible default, catalog ranking still applies below.
    const merge = (catalog, category, time) => [...userProductsFor(category, time), ...catalog];

    // Cache the merged treatment pools so add/remove handlers can re-render
    // the stack without re-running the rank/filter pipeline.
    amTreatmentsCache = merge(amTreatments, 'treatment', 'AM');
    pmTreatmentsCache = merge(pmTreatments, 'treatment', 'PM');

    renderStep('am-cleanser',    'Step 1: Cleanser',    merge(cleansers,                                              'cleanser',    'AM'), selectedRegionData);
    renderTreatmentStack('am-treatment', 'Step 2: Treatment',   amTreatmentsCache, selectedRegionData);
    renderStep('am-moisturizer', 'Step 3: Moisturizer', merge(amMoisturizers.length ? amMoisturizers : moisturizers, 'moisturizer', 'AM'), selectedRegionData);
    renderStep('am-sunscreen',   'Step 4: Sunscreen',   merge(sunscreens,                                             'sunscreen',   'AM'), selectedRegionData);

    renderStep('pm-cleanser',    'Step 1: Cleanser',    merge(cleansers,                                              'cleanser',    'PM'), selectedRegionData);
    renderTreatmentStack('pm-treatment', 'Step 2: Treatment',   pmTreatmentsCache, selectedRegionData);
    renderStep('pm-moisturizer', 'Step 3: Moisturizer', merge(pmMoisturizers.length ? pmMoisturizers : moisturizers, 'moisturizer', 'PM'), selectedRegionData);

    // Capture the default-selected product per slot for conflict detection
    window._dermActiveStack = [
      cleansers[0],
      amTreatments[0],
      (amMoisturizers.length ? amMoisturizers : moisturizers)[0],
      sunscreens[0],
      pmTreatments[0],
      (pmMoisturizers.length ? pmMoisturizers : moisturizers)[0],
    ].filter(Boolean);
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
    const reactions = sGet('dermAI_reactions') || {};
    const hasReaction = !!(reactions[prod.id] && reactions[prod.id].length);

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
        <div class="reaction-row">
          ${hasReaction ? `<span class="reaction-indicator" id="reaction-ind-${prod.id}">REACTION LOGGED</span>` : `<span class="reaction-indicator hidden" id="reaction-ind-${prod.id}">REACTION LOGGED</span>`}
          <button class="reaction-log-btn" onclick="window.openReactionModal('${prod.id}')" aria-label="Log a skin reaction to this product">LOG REACTION</button>
        </div>
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
      </div>`;
  }

  function renderStep(containerId, label, products, regionData) {
    const container = document.getElementById(containerId);
    const m = containerId.match(/^(am|pm)-(\w+)$/);
    const slot = m ? m[1] : 'am';
    const key  = m ? m[2] : containerId;

    const addOwnButton = `
      <details class="add-own-product">
        <summary class="add-own-toggle">+ Add my own product</summary>
        <form class="add-own-form" onsubmit="event.preventDefault(); window.addUserProduct('${slot}', '${key}', this);">
          <label class="add-own-field">
            <span>Name</span>
            <input type="text" name="name" required maxlength="100" placeholder="e.g. Foaming Cleanser" />
          </label>
          <label class="add-own-field">
            <span>Brand (optional)</span>
            <input type="text" name="brand" maxlength="60" placeholder="e.g. CeraVe" />
          </label>
          <fieldset class="add-own-ingredients">
            <legend>Active ingredients (pick what's in your product)</legend>
            <div class="add-own-ing-grid"></div>
          </fieldset>
          <div class="add-own-actions">
            <button type="submit" class="btn btn-primary">Save product</button>
          </div>
        </form>
      </details>`;

    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="step-label">${label}</div>
        <p style="color:var(--neutral-400); margin-top:1.5rem; padding-left:0.5rem;">No matching products found.</p>
        ${addOwnButton}`;
      hydrateAddOwnIngredients(container);
      return;
    }

    const prod = products[0];
    let selectHTML = '';
    if (products.length > 1) {
      selectHTML = `<select class="product-picker" onchange="window.updateStep('${containerId}', this.value, '${regionData.tld}')">`;
      products.forEach(p => {
        const prefix = p._source === 'user' ? '[Yours] ' : '';
        selectHTML += `<option value="${p.id}">${prefix}${p.brand} — ${p.name}</option>`;
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
        ${addOwnButton}
      </div>`;
    hydrateAddOwnIngredients(container);
  }

  // ── Treatment slot stack (multi-treatment support, P3) ────────────────
  // Treatment slots can hold multiple layered products. Other slots stay
  // single-card. Cards are rendered inside the same `<div id="${slot}-treatment">`
  // container and given synthetic indices so updates can target each one.
  // Rendering preserves the existing dropdown / step-content / favorite / log-
  // reaction surface from buildProductCardHTML for each instance.
  //
  // slotChoices[slot].treatment is an array of {source, id}. If empty, the
  // stack defaults to a single instance with the top-ranked product (matches
  // the previous one-card behavior so existing users see no change until they
  // add a second treatment).
  function renderTreatmentStack(containerId, label, products, regionData) {
    const container = document.getElementById(containerId);
    const m = containerId.match(/^(am|pm)-(\w+)$/);
    const slot = m ? m[1] : 'am';
    const key  = 'treatment';

    const addOwnButton = `
      <details class="add-own-product">
        <summary class="add-own-toggle">+ Add my own product</summary>
        <form class="add-own-form" onsubmit="event.preventDefault(); window.addUserProduct('${slot}', '${key}', this);">
          <label class="add-own-field"><span>Name</span><input type="text" name="name" required maxlength="100" placeholder="e.g. Niacinamide 10%" /></label>
          <label class="add-own-field"><span>Brand (optional)</span><input type="text" name="brand" maxlength="60" placeholder="e.g. The Ordinary" /></label>
          <fieldset class="add-own-ingredients"><legend>Active ingredients</legend><div class="add-own-ing-grid"></div></fieldset>
          <div class="add-own-actions"><button type="submit" class="btn btn-primary">Save product</button></div>
        </form>
      </details>`;

    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="step-label">${label}</div>
        <p style="color:var(--neutral-400); margin-top:1.5rem; padding-left:0.5rem;">No matching treatments found.</p>
        ${addOwnButton}`;
      hydrateAddOwnIngredients(container);
      return;
    }

    // Resolve which instances to render. If slotChoices already has entries,
    // honor them; otherwise default to a single instance with the top product.
    const existingChoices = (slotChoices[slot] && Array.isArray(slotChoices[slot][key]))
      ? slotChoices[slot][key].slice()
      : [];
    const instances = existingChoices.length
      ? existingChoices.map(c => products.find(p => p.id === c.id) || products[0])
      : [products[0]];

    container.innerHTML = `
      <div class="step-label">${label}</div>
      <div class="treatment-stack" id="${containerId}-stack" style="margin-top: 1.5rem;">
        ${instances.map((prod, idx) => renderTreatmentInstance(slot, idx, prod, products, regionData)).join('')}
      </div>
      <div class="treatment-stack-actions">
        <button type="button" class="link-btn" onclick="window.addTreatment('${slot}', '${regionData.tld}')">+ Add another treatment</button>
      </div>
      ${addOwnButton}`;
    hydrateAddOwnIngredients(container);
  }

  function renderTreatmentInstance(slot, idx, prod, products, regionData) {
    const cardId = `${slot}-treatment-tx-${idx}`;
    let selectHTML = '';
    if (products.length > 1) {
      selectHTML = `<select class="product-picker" onchange="window.updateTreatment('${slot}', ${idx}, this.value, '${regionData.tld}')">`;
      products.forEach(p => {
        const prefix = p._source === 'user' ? '[Yours] ' : '';
        const sel = p.id === prod.id ? ' selected' : '';
        selectHTML += `<option value="${p.id}"${sel}>${prefix}${p.brand} — ${p.name}</option>`;
      });
      selectHTML += `</select>`;
    }
    const removeBtn = idx > 0
      ? `<button type="button" class="treatment-remove-btn link-btn link-btn--muted" onclick="window.removeTreatment('${slot}', ${idx}, '${regionData.tld}')" aria-label="Remove this treatment">Remove</button>`
      : '';
    return `
      <div class="treatment-instance" data-tx-idx="${idx}">
        ${selectHTML}
        <div class="step-content glass-panel" id="${cardId}-content">
          ${buildProductCardHTML(prod, regionData)}
        </div>
        ${removeBtn}
      </div>`;
  }

  // Click handlers wired from inline onclick — write to slotChoices, sync, redraw.
  window.updateTreatment = function (slot, idx, prodId, tld) {
    let source = 'catalog';
    let prod = allProducts.find(p => p.id === prodId);
    if (!prod) {
      const own = userProducts.find(p => p.id === prodId);
      if (own) { prod = projectUserProduct(own); source = 'user'; }
    }
    if (!prod) return;
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || { tld };
    const cardEl = document.getElementById(`${slot}-treatment-tx-${idx}-content`);
    if (cardEl) cardEl.innerHTML = buildProductCardHTML(prod, regionData);
    if (!slotChoices[slot]) slotChoices[slot] = {};
    if (!Array.isArray(slotChoices[slot].treatment)) slotChoices[slot].treatment = [];
    slotChoices[slot].treatment[idx] = { source, id: prodId };
    rebuildActiveStack();
    syncSlotChoices();
  };

  window.addTreatment = function (slot, tld) {
    if (!slotChoices[slot]) slotChoices[slot] = {};
    if (!Array.isArray(slotChoices[slot].treatment)) slotChoices[slot].treatment = [];
    // Pick a different product than what's already in the stack if possible.
    const treatments = (slot === 'am' ? amTreatmentsCache : pmTreatmentsCache) || [];
    const usedIds = new Set(slotChoices[slot].treatment.map(c => c.id));
    const next = treatments.find(p => !usedIds.has(p.id)) || treatments[0];
    if (!next) return;
    slotChoices[slot].treatment.push({ source: next._source === 'user' ? 'user' : 'catalog', id: next.id });
    syncSlotChoices();
    // Re-render the stack — easier than splicing DOM.
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || amazonRegions[currentRegionCode] || { tld };
    renderTreatmentStack(`${slot}-treatment`, 'Step 2: Treatment', treatments, regionData);
    applySlotChoicesToUI();
    rebuildActiveStack();
  };

  window.removeTreatment = function (slot, idx, tld) {
    if (!slotChoices[slot] || !Array.isArray(slotChoices[slot].treatment)) return;
    if (slotChoices[slot].treatment.length <= 1) return; // keep at least one
    slotChoices[slot].treatment.splice(idx, 1);
    syncSlotChoices();
    const treatments = (slot === 'am' ? amTreatmentsCache : pmTreatmentsCache) || [];
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || amazonRegions[currentRegionCode] || { tld };
    renderTreatmentStack(`${slot}-treatment`, 'Step 2: Treatment', treatments, regionData);
    applySlotChoicesToUI();
    rebuildActiveStack();
  };

  // Caches so add/remove can re-render without re-running rankProducts.
  let amTreatmentsCache = null;
  let pmTreatmentsCache = null;

  function rebuildActiveStack() {
    // Build _dermActiveStack from ALL chosen products in ALL slots so the
    // conflict detector sees layered combinations. Falls back to top-ranked
    // when no choice is recorded for a slot.
    const stack = [];
    for (const slot of ['am', 'pm']) {
      for (const key of ['cleanser', 'treatment', 'moisturizer', 'sunscreen']) {
        if (slot === 'pm' && key === 'sunscreen') continue;
        const choices = slotChoices[slot]?.[key];
        if (Array.isArray(choices)) {
          choices.forEach(c => {
            const p = allProducts.find(pp => pp.id === c.id)
              || (userProducts.find(up => up.id === c.id) && projectUserProduct(userProducts.find(up => up.id === c.id)));
            if (p) stack.push(p);
          });
        } else if (choices && choices.id) {
          const p = allProducts.find(pp => pp.id === choices.id)
            || (userProducts.find(up => up.id === choices.id) && projectUserProduct(userProducts.find(up => up.id === choices.id)));
          if (p) stack.push(p);
        }
      }
    }
    if (stack.length) window._dermActiveStack = stack;
    if (typeof detectAndRenderConflicts === 'function') detectAndRenderConflicts();
  }

  // Populate the add-own-product form's ingredient checkboxes from ingredients.json
  function hydrateAddOwnIngredients(container) {
    const grid = container.querySelector('.add-own-ing-grid');
    if (!grid || !allIngredients.length) return;
    grid.innerHTML = allIngredients.map(ing =>
      `<label class="add-own-ing-chip">
         <input type="checkbox" name="ingredients" value="${ing.id}" />
         <span>${ing.name}</span>
       </label>`
    ).join('');
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
    renderStats(getRange());
    renderHeatmap();
    renderBadges();

    // Sync the day's full per-step state to Supabase. Fail-silent — local
    // is the immediate source of truth; the next click will re-sync if this
    // request was offline/dropped.
    if (window.Storage && Storage.server) {
      Storage.server.post('/api/routine', { log_date: today, steps_done: log[today] }).catch(() => {});
    }
  }

  async function hydrateRoutineFromServer() {
    if (!window.Storage || !Storage.server) return;
    if (!(await Storage.isLoggedIn())) return;
    const body = await Storage.server.get('/api/routine');
    if (!body || !Array.isArray(body.logs)) return;
    const local = sGet('dermAI_routineLog') || {};
    let changed = false;
    for (const row of body.logs) {
      if (!local[row.log_date] && row.steps_done) {
        local[row.log_date] = row.steps_done;
        changed = true;
      }
    }
    if (changed) {
      sSet('dermAI_routineLog', local);
      renderStreak();
      renderStats(getRange());
      renderHeatmap();
      if (typeof renderBadges === 'function') renderBadges();
    }

    // Pull today's slot_choices and reflect them in the routine UI.
    const today = todayKey();
    const todayRow = body.logs.find(r => r.log_date === today);
    if (todayRow && todayRow.slot_choices && typeof todayRow.slot_choices === 'object') {
      slotChoices = todayRow.slot_choices;
      applySlotChoicesToUI();
    }
    renderMyProductsList();
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

  // ── Routine stats — pure computation kept in sync with backend/lib/routineStats.js ──
  const STATS_ROUTINE_STEPS = {
    am: ['cleanser', 'treatment', 'moisturizer', 'sunscreen'],
    pm: ['cleanser', 'treatment', 'moisturizer'],
  };
  const STATS_PER_DAY = STATS_ROUTINE_STEPS.am.length + STATS_ROUTINE_STEPS.pm.length; // 7
  const STEP_LABEL = { cleanser: 'Cleanser', treatment: 'Treatment', moisturizer: 'Moisturizer', sunscreen: 'Sunscreen' };

  function computeStats(logs, rangeDays, today) {
    if (!logs || typeof logs !== 'object') logs = {};
    if (!Number.isInteger(rangeDays) || rangeDays < 1) rangeDays = 30;
    if (!(today instanceof Date)) today = new Date();

    const perStep = { am: {}, pm: {} };
    for (const slot of ['am', 'pm']) for (const k of STATS_ROUTINE_STEPS[slot]) perStep[slot][k] = 0;

    let totalCompleted = 0;
    const totalPossible = rangeDays * STATS_PER_DAY;
    const dailyPct = [];

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const day = logs[k] || {};
      let dayCompleted = 0;
      for (const slot of ['am', 'pm']) {
        const sl = day[slot] || {};
        for (const key of STATS_ROUTINE_STEPS[slot]) {
          if (sl[key] === true) { perStep[slot][key]++; dayCompleted++; }
        }
      }
      totalCompleted += dayCompleted;
      dailyPct.push((dayCompleted / STATS_PER_DAY) * 100);
    }

    for (const slot of ['am', 'pm']) {
      for (const key of STATS_ROUTINE_STEPS[slot]) {
        perStep[slot][key] = Math.round((perStep[slot][key] / rangeDays) * 100);
      }
    }
    const overall_pct = totalPossible ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    let trend = 'flat';
    const half = Math.floor(rangeDays / 2);
    if (half >= 1 && rangeDays >= 2) {
      const olderHalf = dailyPct.slice(0, half);
      const newerHalf = dailyPct.slice(rangeDays - half);
      const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
      const diff = avg(newerHalf) - avg(olderHalf);
      if (diff > 5) trend = 'up'; else if (diff < -5) trend = 'down';
    }
    return { overall_pct, per_step: perStep, total_steps_completed: totalCompleted, total_steps_possible: totalPossible, trend };
  }

  function trendArrow(t) {
    if (t === 'up')   return '<span class="trend-arrow up" title="Improving">↑</span>';
    if (t === 'down') return '<span class="trend-arrow down" title="Declining">↓</span>';
    return '<span class="trend-arrow flat" title="Steady">→</span>';
  }

  function renderStats(rangeDays) {
    const el = document.getElementById('routine-stats');
    if (!el) return;
    const log = sGet('dermAI_routineLog') || {};
    const s = computeStats(log, rangeDays);
    const stepRows = ['am', 'pm'].flatMap(slot =>
      STATS_ROUTINE_STEPS[slot].map(k => `
        <div class="stats-step">
          <span class="stats-step-label">${slot.toUpperCase()} ${STEP_LABEL[k] || k}</span>
          <div class="stats-step-bar"><div class="stats-step-fill" style="width:${s.per_step[slot][k]}%"></div></div>
          <span class="stats-step-pct">${s.per_step[slot][k]}%</span>
        </div>`)
    ).join('');

    el.innerHTML = `
      <div class="stats-headline">
        <div class="stats-overall">
          <span class="stats-overall-pct">${s.overall_pct}%</span>
          ${trendArrow(s.trend)}
        </div>
        <div class="stats-meta">
          <span class="stats-meta-label">OVERALL ADHERENCE · LAST ${rangeDays} DAYS</span>
          <span class="stats-meta-sub">${s.total_steps_completed} of ${s.total_steps_possible} steps complete</span>
        </div>
      </div>
      <div class="stats-grid">${stepRows}</div>`;
    el.classList.remove('hidden');
  }

  function getRange() {
    const stored = parseInt(localStorage.getItem('dermAI_statsRange') || '30', 10);
    return [30, 90, 365].includes(stored) ? stored : 30;
  }

  function setRange(days) {
    if (![30, 90, 365].includes(days)) days = 30;
    localStorage.setItem('dermAI_statsRange', String(days));
    document.querySelectorAll('#range-toggle button').forEach(btn => {
      const sel = parseInt(btn.dataset.range, 10) === days;
      btn.setAttribute('aria-selected', String(sel));
      btn.classList.toggle('active', sel);
    });
    renderStats(days);
    renderHeatmap(days);
  }

  function initRangeToggle() {
    const toggle = document.getElementById('range-toggle');
    if (!toggle) return;
    toggle.classList.remove('hidden');
    toggle.addEventListener('click', e => {
      const btn = e.target.closest('button[data-range]');
      if (!btn) return;
      setRange(parseInt(btn.dataset.range, 10));
    });
    setRange(getRange());
  }

  function renderHeatmap(rangeDaysOverride) {
    const container = document.getElementById('adherence-heatmap');
    if (!container) return;
    const log = sGet('dermAI_routineLog') || {};
    const rangeDays = Number.isInteger(rangeDaysOverride) ? rangeDaysOverride : getRange();
    const TOTAL = STATS_PER_DAY;
    const now = new Date();
    let cells = '';
    for (let i = rangeDays - 1; i >= 0; i--) {
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
    const sizeClass = rangeDays === 30 ? 'range-30' : rangeDays === 90 ? 'range-90' : 'range-365';
    container.innerHTML = `
      <span class="section-eyebrow">${rangeDays}-DAY ADHERENCE</span>
      <div class="heatmap-grid ${sizeClass}">${cells}</div>
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
    const isAdding = idx < 0;
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(prodId);
    sSet('dermAI_favorites', favs);
    if (isAdding) {
      Storage.server.post('/api/favorites', { product_id: prodId }).catch(() => {});
    } else {
      Storage.server.delete('/api/favorites/' + encodeURIComponent(prodId)).catch(() => {});
    }
    const isFav = favs.includes(prodId);
    btn.className = 'fav-btn' + (isFav ? ' fav-active' : '');
    btn.setAttribute('aria-pressed', String(isFav));
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Save to favorites');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${isFav ? 'SAVED' : 'SAVE'}`;
    if (isAdding) setTimeout(() => window.openReorderModal(prodId), 350);
    renderBadges();
  };

  // ── Ingredient conflict warnings ──────────────────────────────────────
  function detectAndRenderConflicts() {
    const container = document.getElementById('conflict-warnings');
    if (!container || !allConflicts.length) return;
    const stack = window._dermActiveStack || [];
    const ingSet = new Set(stack.map(p => p.primaryIngredientId).filter(Boolean));
    const found = allConflicts.filter(c => ingSet.has(c.a) && ingSet.has(c.b));
    if (!found.length) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    container.innerHTML = `
      <span class="section-eyebrow">INGREDIENT ALERTS</span>
      ${found.map(c => `
        <div class="conflict-card">
          <div class="conflict-header">
            <span class="severity-badge severity-${c.severity}">${c.severity.toUpperCase()}</span>
            <strong class="conflict-title">${c.title}</strong>
          </div>
          <p class="conflict-reason">${c.reason}</p>
          <p class="conflict-tip"><strong>Tip:</strong> ${c.tip}</p>
        </div>`).join('')}`;
  }

  // ── Patch-test flow ───────────────────────────────────────────────────
  function initPatchTest() {
    const stack = window._dermActiveStack || [];
    if (!stack.length) return;
    const seen  = sGet('dermAI_seen')       || {};
    const queue = sGet('dermAI_patchQueue') || {};
    const now   = Date.now();
    stack.forEach(prod => {
      if (!seen[prod.id]) {
        seen[prod.id]  = now;
        queue[prod.id] = { addedAt: now, reviewed: false };
      }
    });
    sSet('dermAI_seen', seen);
    sSet('dermAI_patchQueue', queue);

    const HOURS_48 = 48 * 60 * 60 * 1000;
    const due = Object.entries(queue)
      .filter(([, e]) => !e.reviewed && (now - e.addedAt) >= HOURS_48)
      .map(([id]) => allProducts.find(p => p.id === id))
      .filter(Boolean).map(p => p.name);
    if (!due.length) return;

    const banner = document.getElementById('patch-test-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>48h patch test complete for <strong>${due.join(', ')}</strong> — any reaction?</span>
      <div class="patch-test-actions">
        <button class="btn btn-outline" style="padding:0.3rem 0.75rem;font-size:0.68rem;" onclick="window.dismissPatchTest(false)">No reaction</button>
        <button class="btn btn-primary" style="padding:0.3rem 0.75rem;font-size:0.68rem;" onclick="window.dismissPatchTest(true)">Log reaction</button>
      </div>`;
  }

  window.dismissPatchTest = function (logReaction) {
    const queue = sGet('dermAI_patchQueue') || {};
    const now   = Date.now();
    const H48   = 48 * 60 * 60 * 1000;
    Object.keys(queue).forEach(id => {
      if (!queue[id].reviewed && (now - queue[id].addedAt) >= H48) queue[id].reviewed = true;
    });
    sSet('dermAI_patchQueue', queue);
    const banner = document.getElementById('patch-test-banner');
    if (banner) banner.classList.add('hidden');
    if (logReaction) window.openReactionModal(null);
  };

  // ── Reaction log ──────────────────────────────────────────────────────
  window.openReactionModal = function (prodId) {
    const modal = document.getElementById('reaction-modal');
    if (!modal) return;
    const prod = prodId ? allProducts.find(p => p.id === prodId) : null;
    modal.querySelector('.reaction-modal-title').textContent =
      prod ? `Log reaction: ${prod.name}` : 'Log a skin reaction';
    modal.dataset.prodId = prodId || '';
    modal.querySelector('.reaction-severity-input').value = '3';
    modal.querySelector('.severity-display').textContent = '3';
    modal.querySelectorAll('.reaction-symptom').forEach(s => s.classList.remove('active'));
    modal.querySelector('.reaction-notes').value = '';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    modal.querySelector('.modal-close').focus();
  };

  window.closeReactionModal = function () {
    const modal = document.getElementById('reaction-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  window.saveReaction = function () {
    const modal   = document.getElementById('reaction-modal');
    if (!modal) return;
    const prodId   = modal.dataset.prodId || 'general';
    const severity = parseInt(modal.querySelector('.reaction-severity-input').value);
    const symptoms = Array.from(modal.querySelectorAll('.reaction-symptom.active')).map(s => s.dataset.symptom);
    const notes    = modal.querySelector('.reaction-notes').value.trim();
    const reactions = sGet('dermAI_reactions') || {};
    if (!reactions[prodId]) reactions[prodId] = [];
    reactions[prodId].push({ date: new Date().toISOString(), severity, symptoms, notes });
    sSet('dermAI_reactions', reactions);
    Storage.server.post('/api/reactions', {
      product_id: prodId,
      severity: severity,
      notes: symptoms.join(', ') + (notes ? ': ' + notes : '')
    }).catch(() => {});
    window.closeReactionModal();
    if (prodId !== 'general') {
      const ind = document.getElementById(`reaction-ind-${prodId}`);
      if (ind) ind.classList.remove('hidden');
    }
  };

  // ── Reorder reminders ─────────────────────────────────────────────────
  function checkReorderReminders() {
    const data = sGet('dermAI_reorderData') || {};
    const now  = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const due  = Object.entries(data)
      .filter(([, d]) => !d.dismissed && d.estimatedEmpty > now && (d.estimatedEmpty - now) < WEEK)
      .map(([id, d]) => {
        const prod = allProducts.find(p => p.id === id);
        const days = Math.ceil((d.estimatedEmpty - now) / (24 * 60 * 60 * 1000));
        return prod ? `${prod.name} (~${days}d)` : null;
      }).filter(Boolean);
    if (!due.length) return;
    const banner = document.getElementById('reorder-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
      <span>Running low: <strong>${due.join(', ')}</strong></span>
      <a href="/dashboard.html#shopping" class="btn btn-primary" style="padding:0.3rem 0.875rem;font-size:0.68rem;margin-left:auto;">Reorder →</a>
      <button onclick="window.dismissReorderBanner()" class="stale-banner-dismiss" aria-label="Dismiss">&#x2715;</button>`;
  }

  window.openReorderModal = function (prodId) {
    const modal = document.getElementById('reorder-modal');
    if (!modal) return;
    const prod = allProducts.find(p => p.id === prodId);
    const subtitle = modal.querySelector('#reorder-modal-product');
    if (subtitle) subtitle.textContent = prod ? `For: ${prod.brand} ${prod.name}` : '';
    modal.dataset.prodId = prodId;
    modal.querySelector('#reorder-size').value = '50';
    modal.querySelector('#reorder-freq').value = '1';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  window.closeReorderModal = function () {
    const modal = document.getElementById('reorder-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  window.saveReorderReminder = function () {
    const modal  = document.getElementById('reorder-modal');
    if (!modal) return;
    const prodId  = modal.dataset.prodId;
    const sizeML  = parseInt(modal.querySelector('#reorder-size').value);
    const freq    = parseInt(modal.querySelector('#reorder-freq').value);
    const mlPerDay = freq * 0.3; // ~0.3ml per application
    const days    = Math.round(sizeML / mlPerDay);
    const data    = sGet('dermAI_reorderData') || {};
    data[prodId]  = { sizeML, freq, estimatedEmpty: Date.now() + days * 24 * 60 * 60 * 1000, dismissed: false };
    sSet('dermAI_reorderData', data);
    window.closeReorderModal();
  };

  // ── Progress photo timeline ───────────────────────────────────────
  async function initPhotoTimeline() {
    const section = document.getElementById('photos-section');
    if (!section || typeof PhotoDB === 'undefined') return;

    let photos;
    try { photos = await PhotoDB.getAll(); }
    catch (err) { console.warn('[PhotoDB] unavailable:', err); return; }

    photos.sort((a, b) => a.scanAt - b.scanAt);

    if (!photos.length) {
      section.innerHTML = `<p class="photos-empty-msg">No progress photos yet — tick "Save front photo" when you next analyze your skin.</p>`;
      section.classList.remove('hidden');
      return;
    }

    let sliderHTML = '';
    if (photos.length >= 2) {
      const oldest  = URL.createObjectURL(photos[0].blob);
      const newest  = URL.createObjectURL(photos[photos.length - 1].blob);
      const oldDate = new Date(photos[0].scanAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const newDate = new Date(photos[photos.length - 1].scanAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      sliderHTML = `
        <div class="ba-wrapper">
          <div class="section-eyebrow" style="margin-bottom:0.75rem;">BEFORE / AFTER</div>
          <div class="ba-slider" id="ba-slider">
            <div class="ba-before" style="background-image:url('${oldest}')"></div>
            <div class="ba-after" id="ba-after" style="background-image:url('${newest}')"></div>
            <div class="ba-divider" id="ba-divider"></div>
            <div class="ba-handle" id="ba-handle" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <input type="range" class="ba-range" id="ba-range" min="0" max="100" value="50"
              aria-label="Drag to compare before and after photos">
            <span class="ba-label ba-label-left">${oldDate}</span>
            <span class="ba-label ba-label-right">${newDate}</span>
          </div>
        </div>`;
    }

    const timelineHTML = photos.map((p, i) => {
      const url      = URL.createObjectURL(p.blob);
      const date     = new Date(p.scanAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const delta    = i > 0 ? p.score - photos[i - 1].score : null;
      const deltaEl  = delta !== null
        ? `<span class="photo-delta ${delta >= 0 ? 'photo-delta-up' : 'photo-delta-down'}">${delta >= 0 ? '+' : ''}${delta}</span>`
        : '';
      return `
        <div class="photo-entry">
          <img class="photo-thumb" src="${url}" alt="Skin scan — ${date}" loading="lazy">
          <div class="photo-entry-info">
            <span class="photo-entry-date">${date}</span>
            <div class="photo-entry-score">
              <span class="photo-score-num">${p.score}</span>
              <span class="photo-score-label">HEALTH</span>
              ${deltaEl}
            </div>
            <span class="photo-skin-type">${p.skinType}</span>
          </div>
          <button class="photo-delete-btn" onclick="window.deleteProgressPhoto(${p.id})"
            aria-label="Delete progress photo from ${date}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }).join('');

    section.innerHTML = `
      <div class="photos-section-header">
        <div class="section-eyebrow" style="margin:0;">PROGRESS PHOTOS</div>
        <span class="photos-count-badge">${photos.length} scan${photos.length > 1 ? 's' : ''}</span>
      </div>
      ${sliderHTML}
      <div class="photo-timeline">${timelineHTML}</div>`;
    section.classList.remove('hidden');

    if (photos.length >= 2) initBASlider();
  }

  function initBASlider() {
    const range   = document.getElementById('ba-range');
    const after   = document.getElementById('ba-after');
    const divider = document.getElementById('ba-divider');
    const handle  = document.getElementById('ba-handle');
    if (!range || !after) return;

    function update(pct) {
      after.style.clipPath   = `inset(0 0 0 ${pct}%)`;
      if (divider) divider.style.left = pct + '%';
      if (handle)  handle.style.left  = pct + '%';
    }
    update(50);
    range.addEventListener('input', () => update(Number(range.value)));
  }

  window.deleteProgressPhoto = async function (id) {
    if (!confirm('Remove this progress photo?')) return;
    try {
      await PhotoDB.remove(id);
      initPhotoTimeline();
    } catch (err) { console.warn('[PhotoDB] delete failed:', err); }
  };

  // ── F2 — Daily reminder notifications ─────────────────────────────
  function initNotifications() {
    const widget = document.getElementById('notif-widget');
    if (!widget || !('Notification' in window)) return;
    widget.classList.remove('hidden');

    if (typeof NotifPrefs === 'undefined') return;
    const prefs    = NotifPrefs.get();
    const toggle   = document.getElementById('notif-toggle');
    const timesRow = document.getElementById('notif-times-row');
    const amInput  = document.getElementById('notif-am');
    const pmInput  = document.getElementById('notif-pm');
    const hint     = document.getElementById('notif-hint');

    toggle.checked = prefs.enabled && Notification.permission === 'granted';
    amInput.value  = prefs.amTime;
    pmInput.value  = prefs.pmTime;
    if (toggle.checked) timesRow.classList.remove('hidden');

    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const granted = await NotifPrefs.enable();
        if (!granted) {
          toggle.checked = false;
          if (hint) hint.textContent = 'Permission denied — enable notifications in browser settings.';
          return;
        }
        timesRow.classList.remove('hidden');
        if (hint) hint.textContent = '';
      } else {
        NotifPrefs.disable();
        timesRow.classList.add('hidden');
      }
    });

    [amInput, pmInput].forEach(inp => {
      inp.addEventListener('change', () => {
        const p    = NotifPrefs.get();
        p.amTime   = amInput.value;
        p.pmTime   = pmInput.value;
        NotifPrefs.set(p);
        if (p.enabled) NotifPrefs.schedule();
      });
    });
  }

  // ── F14 — Skin diary ──────────────────────────────────────────────
  // One-shot local migration: water values > 5 are legacy "glasses"
  // logged before Phase 1 switched the unit to liters. Convert them
  // (~250ml/glass) so they don't propagate to the server as 8 LITERS.
  // Idempotent: new water input is clamped to 0-5L, so values > 5
  // can only ever be legacy data.
  (function migrateLegacyWaterToLiters() {
    const diary = sGet('dermAI_diary');
    if (!diary) return;
    let touched = false;
    for (const date in diary) {
      const e = diary[date];
      if (e && typeof e.water === 'number' && e.water > 5) {
        e.water = +(e.water * 0.25).toFixed(2);
        touched = true;
      }
    }
    if (touched) sSet('dermAI_diary', diary);
  })();

  function initDiary() {
    const section = document.getElementById('diary-section');
    if (!section) return;
    section.innerHTML = `
      <div class="diary-section-header">
        <div class="section-eyebrow" style="margin:0;">SKIN DIARY</div>
        <span class="diary-autosave-hint">auto-saves on tap</span>
      </div>
      <div id="diary-today" class="diary-today"></div>
      <div id="diary-chart" class="diary-chart" style="margin-top:1.75rem;"></div>`;
    renderDiaryToday();
    renderDiaryChart();
    section.classList.remove('hidden');
  }

  function renderDiaryToday() {
    const el = document.getElementById('diary-today');
    if (!el) return;
    const today = todayKey();
    const diary  = sGet('dermAI_diary') || {};
    const entry  = diary[today] || {};
    const label  = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
    const all3   = entry.sleep !== undefined && entry.water !== undefined && entry.stress !== undefined;

    el.innerHTML = `
      <div class="diary-today-label">
        ${label}
        ${all3 ? '<span class="diary-logged-badge">LOGGED</span>' : ''}
      </div>
      <div class="diary-field">
        <span class="diary-field-label">SLEEP (HRS)</span>
        <div class="diary-chips">
          ${[5,6,7,8,9,10].map(v =>
            `<button class="diary-chip${entry.sleep === v ? ' active' : ''}"
              onclick="window.saveDiaryField('sleep',${v})">${v}</button>`).join('')}
        </div>
      </div>
      <div class="diary-field">
        <span class="diary-field-label">WATER (LITERS)</span>
        <div class="diary-water-row" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
          <input type="number" id="diary-water-input"
                 min="0" max="5" step="0.25"
                 value="${entry.water ?? ''}"
                 placeholder="0.0"
                 onchange="window.saveDiaryWaterLiters(this.value)"
                 style="width:5rem;padding:0.4rem 0.6rem;font:inherit;text-align:center;" />
          <span class="diary-water-goal" style="font-size:0.85rem;opacity:0.7;">of 2.5 L goal</span>
        </div>
        <div class="diary-chips" style="margin-top:0.5rem;">
          <button class="diary-chip" onclick="window.addDiaryWater(0.25)">+250 ml</button>
          <button class="diary-chip" onclick="window.addDiaryWater(0.5)">+500 ml</button>
          <button class="diary-chip" onclick="window.addDiaryWater(1)">+1 L</button>
        </div>
      </div>
      <div class="diary-field">
        <span class="diary-field-label">STRESS (1–5)</span>
        <div class="diary-chips">
          ${[1,2,3,4,5].map(v =>
            `<button class="diary-chip${entry.stress === v ? ' active' : ''}"
              onclick="window.saveDiaryField('stress',${v})">${v}</button>`).join('')}
        </div>
        <div class="diary-stress-scale-label" style="font-size:0.75rem;opacity:0.6;letter-spacing:0.05em;margin-top:0.4rem;display:flex;justify-content:space-between;max-width:14rem;">
          <span>1 = CALM</span><span>5 = OVERWHELMED</span>
        </div>
      </div>`;
  }

  // Map local diary field names to Supabase column names.
  const DIARY_COLUMN = { water: 'water_liters', stress: 'stress_1_5', sleep: 'sleep_hours' };

  window.saveDiaryField = function (field, value) {
    const today = todayKey();
    const diary  = sGet('dermAI_diary') || {};
    if (!diary[today]) diary[today] = {};
    diary[today][field] = value;
    sSet('dermAI_diary', diary);
    renderDiaryToday();
    renderDiaryChart();

    // Sync just the changed field upstream — partial upsert keeps other
    // fields the user touched today untouched server-side. Fail-silent.
    if (window.Storage && Storage.server && DIARY_COLUMN[field]) {
      Storage.server.post('/api/diary', {
        log_date: today,
        [DIARY_COLUMN[field]]: value,
      }).catch(() => {});
    }
  };

  async function hydrateDiaryFromServer() {
    if (!window.Storage || !Storage.server) return;
    if (!(await Storage.isLoggedIn())) return;
    const body = await Storage.server.get('/api/diary');
    if (!body || !Array.isArray(body.entries)) return;
    const local = sGet('dermAI_diary') || {};
    let changed = false;
    for (const row of body.entries) {
      const slot = local[row.log_date] || {};
      if (row.water_liters != null && slot.water  === undefined) { slot.water  = Number(row.water_liters);  changed = true; }
      if (row.stress_1_5   != null && slot.stress === undefined) { slot.stress = Number(row.stress_1_5);    changed = true; }
      if (row.sleep_hours  != null && slot.sleep  === undefined) { slot.sleep  = Number(row.sleep_hours);   changed = true; }
      local[row.log_date] = slot;
    }
    if (changed) {
      sSet('dermAI_diary', local);
      renderDiaryToday();
      renderDiaryChart();
    }
  }

  window.saveDiaryWaterLiters = function (val) {
    const v = parseFloat(val);
    const safe = isNaN(v) ? 0 : Math.max(0, Math.min(5, v));
    window.saveDiaryField('water', +safe.toFixed(2));
  };

  window.addDiaryWater = function (deltaL) {
    const today = todayKey();
    const diary = sGet('dermAI_diary') || {};
    const current = (diary[today] && typeof diary[today].water === 'number') ? diary[today].water : 0;
    const next = Math.min(5, +(current + deltaL).toFixed(2));
    window.saveDiaryField('water', next);
  };

  function renderDiaryChart() {
    const el = document.getElementById('diary-chart');
    if (!el) return;
    const diary   = sGet('dermAI_diary') || {};
    const history = JSON.parse(localStorage.getItem('dermAI_history') || '[]');
    const today   = new Date();

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k     = d.toISOString().slice(0, 10);
      const entry = diary[k] || {};
      const scan  = history.find(h => h.date && h.date.slice(0, 10) === k);
      days.push({ entry, scan, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }

    const logged = days.filter(d => Object.keys(d.entry).length > 0).length;
    if (logged < 3) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="section-eyebrow" style="margin-bottom:1rem;">14-DAY OVERVIEW</div>
      <div class="diary-grid">
        ${days.map(d => {
          const sleepH  = d.entry.sleep  !== undefined ? Math.round((d.entry.sleep  / 10) * 60) : 0;
          const waterH  = d.entry.water  !== undefined ? Math.round(Math.min(d.entry.water / 3, 1) * 60) : 0;
          const stressH = d.entry.stress !== undefined ? Math.round((d.entry.stress /  5) * 60) : 0;
          return `
            <div class="diary-col">
              <div class="diary-bars">
                <div class="diary-bar-slot"><div class="diary-bar diary-bar-sleep"  style="height:${sleepH}px"  title="Sleep: ${d.entry.sleep ?? '—'}h"></div></div>
                <div class="diary-bar-slot"><div class="diary-bar diary-bar-water"  style="height:${waterH}px"  title="Water: ${d.entry.water ?? '—'} L"></div></div>
                <div class="diary-bar-slot"><div class="diary-bar diary-bar-stress" style="height:${stressH}px" title="Stress: ${d.entry.stress ?? '—'}/5"></div></div>
              </div>
              <div class="diary-scan-dot${d.scan ? '' : ' diary-scan-empty'}" title="${d.scan ? 'Scan: ' + d.scan.overallHealth : 'No scan'}"></div>
              <span class="diary-col-label">${d.label}</span>
            </div>`;
        }).join('')}
      </div>
      <div class="diary-legend">
        <span class="diary-leg diary-leg-sleep">SLEEP</span>
        <span class="diary-leg diary-leg-water">WATER</span>
        <span class="diary-leg diary-leg-stress">STRESS</span>
        <span class="diary-leg diary-leg-scan">SCAN DAY</span>
      </div>`;
  }

  // ── F15 — Shareable routine card (Canvas → PNG) ───────────────────
  window.shareRoutineCard = async function () {
    const analysis = JSON.parse(localStorage.getItem('dermAI_analysis') || 'null');
    if (!analysis) { alert('No skin analysis found — run a scan first.'); return; }

    await document.fonts.ready;

    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Dark background + subtle grid
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Top pink accent bar
    ctx.fillStyle = '#f5588e';
    ctx.fillRect(0, 0, W, 7);

    // Wordmark
    ctx.fillStyle = '#f5588e';
    ctx.font = '700 52px "Space Mono", monospace';
    ctx.fillText('DermAI', 72, 108);

    // Health score
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 132px "Space Mono", monospace';
    ctx.fillText(String(analysis.overallHealth ?? '--'), 72, 290);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = '700 24px "Space Mono", monospace';
    ctx.fillText('HEALTH SCORE', 72, 330);

    // Skin type badge
    ctx.font = '700 21px "Space Mono", monospace';
    const typeLabel = (analysis.skinType || 'Unknown').toUpperCase();
    const tw = ctx.measureText(typeLabel).width + 32;
    ctx.fillStyle = 'rgba(245,88,142,0.15)';
    ctx.fillRect(72, 353, tw, 44);
    ctx.strokeStyle = '#f5588e';
    ctx.lineWidth = 2;
    ctx.strokeRect(72, 353, tw, 44);
    ctx.fillStyle = '#f5588e';
    ctx.fillText(typeLabel, 88, 382);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(72, 424); ctx.lineTo(W - 72, 424); ctx.stroke();

    // Targeting row
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '700 18px "Space Mono", monospace';
    ctx.fillText('TARGETING', 72, 470);

    let cx = 72;
    (analysis.concerns || []).slice(0, 4).forEach(c => {
      ctx.font = '700 16px "Space Mono", monospace';
      const cw = ctx.measureText(c.name.toUpperCase()).width + 24;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.fillRect(cx, 484, cw, 34);
      ctx.strokeRect(cx, 484, cw, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.name.toUpperCase(), cx + 12, 507);
      cx += cw + 10;
    });

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(72, 548); ctx.lineTo(W - 72, 548); ctx.stroke();

    // Streak
    const streak = computeStreak();
    if (streak > 0) {
      ctx.fillStyle = '#f5588e';
      ctx.font = '700 110px "Space Mono", monospace';
      ctx.fillText(String(streak), 72, 695);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.fillText('DAY STREAK', 72, 734);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.fillText('START YOUR STREAK TODAY', 72, 650);
    }

    // Bottom accent + date
    ctx.fillStyle = '#f5588e';
    ctx.fillRect(0, H - 7, W, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '400 19px "Space Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(),
      W - 72, H - 26
    );
    ctx.textAlign = 'left';

    const link = document.createElement('a');
    link.download = `dermai-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  window.dismissReorderBanner = function () {
    const banner = document.getElementById('reorder-banner');
    if (banner) banner.classList.add('hidden');
    const data = sGet('dermAI_reorderData') || {};
    const now  = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    Object.keys(data).forEach(id => {
      if (!data[id].dismissed && data[id].estimatedEmpty > now && (data[id].estimatedEmpty - now) < WEEK)
        data[id].dismissed = true;
    });
    sSet('dermAI_reorderData', data);
  };

  window.updateStep = function(containerId, prodId, tld) {
    let source = 'catalog';
    let prod = allProducts.find(p => p.id === prodId);
    if (!prod) {
      const own = userProducts.find(p => p.id === prodId);
      if (own) { prod = projectUserProduct(own); source = 'user'; }
    }
    if (!prod) return;
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || { tld };
    const cardEl = document.getElementById(`${containerId}-content`);
    if (cardEl) cardEl.innerHTML = buildProductCardHTML(prod, regionData);

    // Record today's product choice for this slot and sync to the server.
    // Treatment slots use updateTreatment(); this path handles single-card
    // slots (cleanser, moisturizer, sunscreen).
    const m = containerId.match(/^(am|pm)-(\w+)$/);
    if (m) {
      const [, slot, key] = m;
      if (key === 'treatment') return; // routed through updateTreatment
      if (!slotChoices[slot]) slotChoices[slot] = {};
      slotChoices[slot][key] = { source, id: prodId };
      rebuildActiveStack();
      syncSlotChoices();
    }
  };

  // Send today's slot_choices alongside the current local steps_done so we
  // never clobber the day's checklist progress.
  function syncSlotChoices() {
    if (!window.Storage || !Storage.server) return;
    const log = sGet('dermAI_routineLog') || {};
    const today = todayKey();
    Storage.server.post('/api/routine', {
      log_date: today,
      steps_done: log[today] || {},
      slot_choices: slotChoices,
    }).catch(() => {});
  }

  // Submit handler for the inline "+ Add my own product" form.
  window.addUserProduct = async function(slot, key, formEl) {
    const name = formEl.querySelector('[name=name]').value.trim();
    const brand = formEl.querySelector('[name=brand]').value.trim();
    const ingredients = Array.from(formEl.querySelectorAll('input[name=ingredients]:checked')).map(c => c.value);
    if (!name) return;
    if (!window.Storage || !Storage.server) return;

    const submitBtn = formEl.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const body = await Storage.server.post('/api/user-products', {
        name,
        brand: brand || null,
        category: key,
        best_time_of_day: slot.toUpperCase(),
        ingredients,
      });
      if (body && body.product) {
        userProducts.unshift(body.product);
        // Re-render the routine so the new product shows in this and any
        // matching slot. Re-hydrate today's slot choice and the checklist.
        filterAndRenderProducts();
        initChecklist();
        applySlotChoicesToUI();
        renderMyProductsList();
      }
    } catch (e) {
      console.warn('Failed to add product', e);
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  // After (re-)render, reflect today's slot_choices in the dropdowns.
  // Treatment slots are array-shaped (multi-treatment); other slots are
  // single-object. Both shapes from the server are handled here.
  function applySlotChoicesToUI() {
    const tld = (amazonRegions[currentRegionCode] || {}).tld || 'com';
    for (const slot of ['am', 'pm']) {
      if (!slotChoices[slot]) continue;
      for (const key of Object.keys(slotChoices[slot])) {
        const value = slotChoices[slot][key];
        if (key === 'treatment') {
          // Treatment is always array-shaped post-P3.
          const choices = Array.isArray(value) ? value : (value ? [value] : []);
          choices.forEach((choice, idx) => {
            if (!choice || !choice.id) return;
            const select = document.querySelector(`#${slot}-treatment .treatment-instance[data-tx-idx="${idx}"] select.product-picker`);
            if (select && [...select.options].some(o => o.value === choice.id)) {
              select.value = choice.id;
              window.updateTreatment(slot, idx, choice.id, tld);
            }
          });
        } else {
          // Single-object slots.
          const choice = Array.isArray(value) ? value[0] : value;
          if (!choice || !choice.id) continue;
          const containerId = `${slot}-${key}`;
          const select = document.querySelector(`#${containerId} select.product-picker`);
          if (select && [...select.options].some(o => o.value === choice.id)) {
            select.value = choice.id;
            window.updateStep(containerId, choice.id, tld);
          }
        }
      }
    }
    rebuildActiveStack();
  }

  // Render the "My products" management list — populated when section exists.
  function renderMyProductsList() {
    const el = document.getElementById('my-products-list');
    if (!el) return;
    if (!userProducts.length) {
      el.innerHTML = '<p class="my-products-empty">No custom products yet. Add one from any routine slot above.</p>';
      return;
    }
    el.innerHTML = userProducts.map(p => `
      <li class="my-product-row">
        <div class="my-product-meta">
          <span class="my-product-name">${p.brand ? `${p.brand} — ` : ''}${p.name}</span>
          <span class="my-product-tag">${p.category} · ${p.best_time_of_day}</span>
        </div>
        <button class="my-product-delete" onclick="window.deleteUserProduct('${p.id}')" aria-label="Delete this product">Delete</button>
      </li>
    `).join('');
  }

  // ── Add-by-link: paste URL+ingredients, AI evaluates, add to routine ──
  // Hits POST /api/evaluate-product (server caches verdicts globally so
  // repeat lookups don't burn AI tokens). On success renders a verdict
  // panel with score + recommended slot + conflicts + an "Add to routine"
  // button that POSTs to /api/user-products/from-evaluation.
  window.evaluateAndAddProduct = async function (formEl) {
    if (!window.Storage || !Storage.server) return;
    const submitBtn = formEl.querySelector('#abl-submit');
    const verdictEl = document.getElementById('abl-verdict');
    if (!verdictEl) return;

    const body = {
      name: formEl.querySelector('[name=name]').value.trim(),
      brand: formEl.querySelector('[name=brand]').value.trim() || null,
      source_url: formEl.querySelector('[name=source_url]').value.trim() || null,
      raw_ingredients_text: formEl.querySelector('[name=raw_ingredients_text]').value.trim(),
    };
    if (!body.name || !body.raw_ingredients_text) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Evaluating…';
    verdictEl.classList.remove('hidden');
    verdictEl.innerHTML = '<p class="abl-pending">⏳ Asking the AI to read the ingredient list and check the evidence…</p>';

    let result;
    try {
      result = await Storage.server.post('/api/evaluate-product', body);
    } catch (e) {
      result = null;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Evaluate with AI';

    if (!result || !result.evaluation) {
      verdictEl.innerHTML = '<p class="abl-error">Evaluation failed — try again in a moment.</p>';
      return;
    }

    const ev = result.evaluation;
    const v  = ev.verdict_json || {};
    const cacheBadge = result.fromCache
      ? '<span class="abl-cache-badge">⚡ FROM CACHE — no AI tokens burned</span>'
      : '<span class="abl-cache-badge abl-cache-badge--fresh">✨ FRESH EVALUATION</span>';

    const score = Number.isFinite(v.score) ? Math.max(1, Math.min(10, Math.round(v.score))) : 5;
    const scoreColor = score >= 8 ? '#2a8a64' : score >= 5 ? '#9a5416' : 'var(--primary-700)';

    const conflicts = Array.isArray(v.conflicts) && v.conflicts.length
      ? `<div class="abl-conflicts"><strong>⚠ Conflicts:</strong> ${v.conflicts.join(', ')}</div>`
      : '<div class="abl-no-conflicts">No conflicts flagged with common actives.</div>';

    const slotPretty = ev.category && ev.best_time_of_day
      ? `${ev.best_time_of_day} · ${ev.category}`
      : 'unspecified';

    const notes = Array.isArray(v.evidence_notes) && v.evidence_notes.length
      ? `<ul class="abl-notes">${v.evidence_notes.slice(0, 4).map(n => `<li><strong>${n.ingredient}:</strong> ${n.note}</li>`).join('')}</ul>`
      : '';

    const ingredientChips = (ev.ingredients || []).map(id =>
      `<span class="ing-chip">${id.replace(/_/g, ' ')}</span>`
    ).join('');

    const unmappedHint = (ev.unmapped_ingredients || []).length
      ? `<p class="abl-unmapped">Unrecognized: ${ev.unmapped_ingredients.slice(0, 6).join(', ')}</p>`
      : '';

    verdictEl.innerHTML = `
      <div class="abl-card">
        ${cacheBadge}
        <div class="abl-headline">
          <div class="abl-score" style="color:${scoreColor}"><strong>${score}</strong><small>/10</small></div>
          <div class="abl-summary">
            <div class="abl-name">${ev.brand ? ev.brand + ' — ' : ''}${ev.name}</div>
            <p class="abl-summary-text">${v.summary || 'AI provided no summary.'}</p>
            <p class="abl-slot">Recommended slot: <strong>${slotPretty}</strong></p>
          </div>
        </div>
        <div class="abl-section">
          <span class="ing-prefix">MATCHED ACTIVES:</span> ${ingredientChips || '<em>none recognized</em>'}
          ${unmappedHint}
        </div>
        ${conflicts}
        ${notes}
        <div class="abl-actions">
          <button type="button" class="btn btn-primary" id="abl-add-btn">Add to my routine</button>
        </div>
      </div>
    `;

    document.getElementById('abl-add-btn').addEventListener('click', async () => {
      const addBtn = document.getElementById('abl-add-btn');
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      const addResult = await Storage.server.post('/api/user-products/from-evaluation', {
        evaluation_id: ev.id,
        source_url: body.source_url,
      });
      if (addResult?.product) {
        userProducts.unshift(addResult.product);
        filterAndRenderProducts();
        initChecklist();
        applySlotChoicesToUI();
        renderMyProductsList();
        addBtn.textContent = 'Added ✓';
        formEl.reset();
        setTimeout(() => verdictEl.classList.add('hidden'), 2500);
      } else {
        addBtn.disabled = false;
        addBtn.textContent = 'Try again';
      }
    });
  };

  window.deleteUserProduct = async function(id) {
    if (!window.Storage || !Storage.server) return;
    try {
      await Storage.server.delete('/api/user-products/' + encodeURIComponent(id));
      userProducts = userProducts.filter(p => p.id !== id);
      // Drop any slot_choice that referenced the deleted product
      for (const slot of ['am', 'pm']) {
        if (!slotChoices[slot]) continue;
        for (const key of Object.keys(slotChoices[slot])) {
          if (slotChoices[slot][key]?.id === id) delete slotChoices[slot][key];
        }
      }
      filterAndRenderProducts();
      initChecklist();
      applySlotChoicesToUI();
      renderMyProductsList();
    } catch (e) {
      console.warn('Failed to delete product', e);
    }
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
