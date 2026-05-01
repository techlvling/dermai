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
  let routineItems = [];   // {id, product_id, slot, time_of_day, ...} from /api/routine-items
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

  // Fetch the user's owned routine items. Silent on auth/network failure —
  // anonymous users simply see empty-slot CTAs pointing at Treatment.
  async function loadRoutineItems() {
    routineItems = [];
    if (!window.Storage || !Storage.server) return;
    if (!(await Storage.isLoggedIn())) return;
    try {
      const body = await Storage.server.get('/api/routine-items');
      if (body && Array.isArray(body.items)) routineItems = body.items;
    } catch (_) { /* silent */ }
  }

  // Resolve owned items for a (slot, time) pair to full catalog products.
  function ownedProductsFor(slotKey, time) {
    return routineItems
      .filter(it => it.slot === slotKey && (it.time_of_day === time || it.time_of_day === 'both'))
      .map(it => allProducts.find(p => p.id === it.product_id))
      .filter(Boolean);
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
        userAnalysis.__closeup_meta = latest.closeup_meta || null;
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
          initDailyCtas();
          return;
        }
      }
    } else {
      const savedData = localStorage.getItem('dermAI_analysis');
      if (!savedData) {
        noAnalysisWarning.classList.remove('hidden');
        initDailyCtas();
        return;
      }
      userAnalysis = JSON.parse(savedData);
    }

    if (syncPending) {
      const banner = document.createElement('div');
      banner.className = 'sync-pending-banner';
      banner.style.cssText = 'margin-bottom:1rem; padding:0.75rem 1rem; background:rgba(255,170,122,0.12); border:1px solid rgba(255,170,122,0.35); border-radius:var(--radius-md,12px); font-size:0.78rem; color:#9a5416;';
      banner.innerHTML = '⚠ this scan didn\'t sync to ur account yet. <button id="sync-retry" style="background:none;border:none;color:var(--primary-700);text-decoration:underline;cursor:pointer;font-weight:600;">retry sync</button>';
      const target = document.getElementById('routine-content') || document.body;
      target.prepend(banner);
      document.getElementById('sync-retry')?.addEventListener('click', async () => {
        if (!Storage.server) return;
        const r = await Storage.server.post('/api/scans', { result_json: userAnalysis });
        if (r?.scan?.id) {
          banner.innerHTML = '✓ synced fr';
          setTimeout(() => banner.remove(), 1500);
        } else {
          banner.querySelector('button').textContent = 'still didn\'t sync — try again';
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
            <span>this scan is ${Math.floor(ageDays)} days old. ur face has had a whole arc since then.</span>
            <a href="/analyze.html">re-scan</a>
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
        // Newest per-ingredient last_refreshed = the cron's last successful run.
        const refreshedTimes = allIngredients
          .map(i => i.last_refreshed)
          .filter(Boolean)
          .map(t => new Date(t).getTime());
        let evidenceLine = '';
        if (refreshedTimes.length) {
          const newest = Math.max(...refreshedTimes);
          const days = Math.floor((Date.now() - newest) / 86400000);
          const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
          evidenceLine = ` &nbsp;·&nbsp; receipts last checked: <strong>${ago}</strong>`;
        }
        detectedRegionEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Showing products on amazon.${region.tld} (${region.name}).${evidenceLine}`;
      }

      await loadRoutineItems();
      filterAndRenderProducts();
      initChecklist();
      initRangeToggle(); // also calls renderStats + renderHeatmap with current range
      renderBadges();
      detectAndRenderConflicts();
      initPatchTest();
      checkReorderReminders();
      renderWeatherFromLocation();
      initPhotoTimeline();
      initNotifications();
      initDailyCtas();
      hydrateRoutineFromServer();
    } catch (err) {
      console.error('Failed to load DB', err);
      document.querySelector('.routine-timeline').innerHTML = '<p class="error" style="text-align: center;">couldn\'t connect to the db. backend probably napping.</p>';
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
    renderSpotFindings();
  }

  // ── Spot findings (per-closeup AI observations from step 2 of scan) ──────
  // Renders only when both result_json.spotFindings and closeup_meta are
  // present. closeup_meta supplies the photo URL + user note, spotFindings
  // supplies the AI observation. They are length-matched in upload order.
  function renderSpotFindings() {
    const findings = Array.isArray(userAnalysis?.spotFindings) ? userAnalysis.spotFindings : [];
    if (findings.length === 0) return;
    const meta = Array.isArray(userAnalysis?.__closeup_meta) ? userAnalysis.__closeup_meta : [];

    const profileBlock = document.querySelector('.skin-profile-summary');
    const routineContent = document.getElementById('routine-content');
    if (!profileBlock || !routineContent) return;

    const existing = document.getElementById('recs-spotfindings');
    if (existing) existing.remove();

    const section = document.createElement('section');
    section.id = 'recs-spotfindings';
    section.className = 'spotfindings-section';
    section.style.marginBottom = '2rem';

    const cardsHTML = findings.map((sf, i) => {
      const note = (sf.note || meta[i]?.note || '').toString();
      const observation = (sf.observation || 'No observation returned.').toString();
      const concern = (sf.concern || 'Other').toString();
      const sev = Number.isFinite(sf.severity) ? Math.max(0, Math.min(100, Math.round(sf.severity))) : null;
      const seeDerm = sf.seeDerm === true;
      const url = meta[i]?.url || null;

      const sevHTML = sev !== null ? `
        <div class="sf-sev">
          <div class="sf-sev-bar"><div class="sf-sev-fill" style="width:${sev}%"></div></div>
          <span class="sf-sev-num">${sev}/100</span>
        </div>` : '';

      const seeDermHTML = seeDerm ? `
        <div class="sf-derm-callout" role="note">
          <strong>⚕ See a board-certified dermatologist in person.</strong>
          This is a visual observation, not a diagnosis. Any flagged mole, lesion, or persistent skin change warrants in-person evaluation by a clinician.
        </div>` : '';

      // Drive URLs are folder/file viewer links — they don't render as <img>
      // sources directly. If we have a URL, link to it; otherwise show a
      // placeholder. Direct thumbnails would require a server-side proxy.
      const thumbHTML = url
        ? `<a href="${url}" target="_blank" rel="noopener" class="sf-thumb sf-thumb--placeholder" aria-label="open close-up ${i + 1} in Drive"></a>`
        : `<div class="sf-thumb sf-thumb--placeholder" aria-hidden="true"></div>`;

      const noteHTML = note
        ? `<p class="sf-note">u said: "${note.replace(/"/g, '&quot;')}"</p>`
        : `<p class="sf-note sf-note--empty">no note attached</p>`;

      return `
        <article class="sf-card${seeDerm ? ' sf-card--derm' : ''}">
          ${thumbHTML}
          <div class="sf-body">
            <div class="sf-head">
              <span class="sf-concern">${concern}</span>
              ${sevHTML}
            </div>
            ${noteHTML}
            <p class="sf-obs">${observation}</p>
            ${seeDermHTML}
          </div>
        </article>
      `;
    }).join('');

    section.innerHTML = `
      <div class="sf-header">
        <span class="section-eyebrow">spots u flagged</span>
        <h2 class="sf-title">what we saw on ur close-ups</h2>
        <p class="sf-sub">specific to the photos u uploaded with ur scan.</p>
      </div>
      <div class="sf-grid">${cardsHTML}</div>
    `;
    profileBlock.parentNode.insertBefore(section, profileBlock.nextSibling);
  }

  // Product-level evidence weight. Multiplies the ingredient × severity score
  // so RCT-tested finished formulations rank above brands that just bottle
  // the molecule. Tier definitions live in products.json:
  //   1 = published in-vivo RCTs of this exact formulation
  //   2 = manufacturer claim studies / dermatology-channel pipeline
  //   3 = well-formulated by reputation, no specific finished-product trials
  //   4 = ingredient evidence only — no finished-product testing
  const PRODUCT_TIER_WEIGHT = { 1: 1.6, 2: 1.25, 3: 1.0, 4: 0.8 };

  // Brand-reputation tiebreaker for products tied within the same tier. Most
  // brands stay at the 1.0 baseline; this only nudges the very-established
  // research brands above ingredient-only newcomers when scores otherwise tie.
  const BRAND_WEIGHT = {
    'SkinCeuticals': 1.10, 'La Roche-Posay': 1.08, 'Avene': 1.07,
    'CeraVe': 1.06, 'Eucerin': 1.06, 'EltaMD': 1.07, 'Galderma': 1.10,
    'PanOxyl': 1.08, 'Bioderma': 1.05, 'Cetaphil': 1.05,
    'Aveeno': 1.04, 'Neutrogena': 1.03, "Paula's Choice": 1.04,
    'RoC': 1.06, 'Sebamed': 1.04,
  };

  // Rank products by:
  //   max(severity) × ingredient.evidenceTier × productEvidenceTier weight × brand weight
  function rankProducts(products) {
    return [...products].sort((a, b) => {
      const scoreFor = (prod) => {
        const ing = allIngredients.find(i => i.id === prod.primaryIngredientId);
        const ingTier = ing ? ing.evidenceTier : 1;
        const maxSeverity = userAnalysis.concerns
          .filter(c => prod.concerns.includes(c.name))
          .reduce((max, c) => Math.max(max, c.severity || 0), 0);
        const productWeight = PRODUCT_TIER_WEIGHT[prod.productEvidenceTier] || 1.0;
        const brandWeight   = BRAND_WEIGHT[prod.brand] || 1.0;
        return maxSeverity * ingTier * productWeight * brandWeight;
      };
      return scoreFor(b) - scoreFor(a);
    });
  }

  // Render the routine slots from the user's owned products only. Each slot
  // is filled from /api/routine-items; empty slots show a CTA that links to
  // the Treatment page where the user can add catalog products.
  function filterAndRenderProducts() {
    const selectedRegionData = amazonRegions[currentRegionCode];

    const SLOT_DEFS = [
      { id: 'am-cleanser',    label: 'step 1 — wash',         slotKey: 'cleanser',    time: 'AM' },
      { id: 'am-treatment',   label: 'step 2 — actives',      slotKey: 'treatment',   time: 'AM' },
      { id: 'am-moisturizer', label: 'step 3 — moisturize',   slotKey: 'moisturizer', time: 'AM' },
      { id: 'am-sunscreen',   label: 'step 4 — spf',          slotKey: 'sunscreen',   time: 'AM' },
      { id: 'pm-cleanser',    label: 'step 1 — wash',         slotKey: 'cleanser',    time: 'PM' },
      { id: 'pm-treatment',   label: 'step 2 — actives',      slotKey: 'treatment',   time: 'PM' },
      { id: 'pm-moisturizer', label: 'step 3 — moisturize',   slotKey: 'moisturizer', time: 'PM' },
    ];

    // Cache the owned treatment pools so add/remove handlers can re-render
    // the stack without re-running the lookup pipeline.
    amTreatmentsCache = ownedProductsFor('treatment', 'AM');
    pmTreatmentsCache = ownedProductsFor('treatment', 'PM');

    for (const def of SLOT_DEFS) {
      const owned = ownedProductsFor(def.slotKey, def.time);
      if (owned.length === 0) {
        renderEmptySlot(def.id, def.label, def.slotKey);
        continue;
      }
      if (def.slotKey === 'treatment') {
        renderTreatmentStack(def.id, def.label, owned, selectedRegionData);
      } else {
        renderStep(def.id, def.label, owned, selectedRegionData);
      }
    }

    // Active stack for conflict detection = every owned product (deduped).
    const seen = new Set();
    window._dermActiveStack = routineItems
      .map(it => allProducts.find(p => p.id === it.product_id))
      .filter(p => p && !seen.has(p.id) && (seen.add(p.id) || true));
  }

  // Empty-slot CTA — shown when the user owns no products for this slot.
  // Uses .step-empty class (not .step-content) so initChecklist's
  // "MARK DONE" button doesn't attach to an empty slot the user can't act on.
  function renderEmptySlot(containerId, label, slotKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const noun = { cleanser: 'cleanser', treatment: 'treatment', moisturizer: 'moisturizer', sunscreen: 'sunscreen' }[slotKey] || slotKey;
    container.innerHTML = `
      <div class="step-label">${label}</div>
      <div class="step-empty glass-panel" id="${containerId}-content">
        <p class="step-empty-msg">this slot's empty asf.</p>
        <a href="/dashboard.html#treatment" class="btn btn-primary">go yeet a ${noun} in there →</a>
      </div>`;
  }

  // Freshness pill — shows how recently the cited evidence was refreshed
  // from PubMed. Backed by ingredient.last_refreshed which is stamped by the
  // weekly Vercel cron. When the cron has never run (or this ingredient was
  // served from the on-disk fallback), there's no last_refreshed and we
  // surface "Not yet checked" so the user knows the source might be stale.
  function freshnessPillHTML(lastRefreshed) {
    let cls, text;
    if (!lastRefreshed) {
      cls = 'fresh-stale';
      text = 'Not yet checked';
    } else {
      const days = Math.floor((Date.now() - new Date(lastRefreshed).getTime()) / 86400000);
      if (days < 14) {
        cls = 'fresh-good';
        text = days === 0 ? 'Refreshed today' : `Fresh · ${days}d ago`;
      } else if (days < 60) {
        cls = 'fresh-aging';
        text = `Aging · ${days}d ago`;
      } else {
        cls = 'fresh-stale';
        text = `Stale · ${days}d ago`;
      }
    }
    return `<span class="freshness-pill ${cls}" title="When PubMed was last queried for this ingredient">${text}</span>`;
  }

  // Product-level evidence badge — surfaces "this exact bottle has clinical
  // trials" vs "this brand has a publishing history" vs "ingredient evidence
  // only". Honest signal that lets users distinguish SkinCeuticals C E
  // Ferulic from a generic vitamin C serum.
  function trialBadgeHTML(prod) {
    const tier = prod.productEvidenceTier || 3;
    if (tier === 1) return '<span class="trial-badge trial-badge--top" title="Published in-vivo RCTs of this exact formulation">RCT-tested</span>';
    if (tier === 2) return '<span class="trial-badge trial-badge--mid" title="Manufacturer-published claim studies">Claims-studied</span>';
    if (tier === 4) return '<span class="trial-badge trial-badge--low" title="Ingredient-level evidence only — no finished-product trials published">Ingredient-only</span>';
    return ''; // tier 3 = no badge (the silent middle)
  }

  // Rx badge — shown alongside the trial badge when a product requires a
  // prescription in India. Tells users they need to see a dermatologist
  // before using, which is non-negotiable for hydroquinone, tretinoin,
  // ivermectin, fluocinolone, etc.
  function rxBadgeHTML(prod) {
    if (!prod.requiresPrescription) return '';
    return '<span class="trial-badge trial-badge--rx" title="Prescription required in India — consult a dermatologist before use">⚕ Rx</span>';
  }

  function buildEvidenceHTML(prod, ingredient) {
    const userConcernNames = userAnalysis.concerns.map(c => c.name);
    const matchedConcerns = prod.concerns.filter(pc => userConcernNames.includes(pc));
    if (!matchedConcerns.length || !ingredient) return '';

    // Citation order: prefer product-specific trials (curated via the
    // enrichProductTrials script — PMIDs that mention the brand or this
    // exact formulation) over generic ingredient-level trials.
    const productTrial = Array.isArray(prod.productTrials) && prod.productTrials.length
      ? prod.productTrials[0]
      : null;
    const study = productTrial || (ingredient.keyStudies && ingredient.keyStudies[0]);
    const studyLink = study
      ? `<a href="${study.link}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-400); text-decoration:underline;">[PMID ${study.pubmedId}]</a>`
      : '';
    // Show extra brand-named PMIDs (up to 2 more) as a small "more trials"
    // line for products that actually have published clinical evidence.
    const extraTrialLinks = Array.isArray(prod.productTrials) && prod.productTrials.length > 1
      ? prod.productTrials.slice(1, 3).map(t =>
          `<a href="${t.link}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-400); text-decoration:underline;">[PMID ${t.pubmedId}]</a>`
        ).join(' · ')
      : '';

    // Build rationale from concerns.json
    const rationales = matchedConcerns
      .map(cn => allConcerns[cn] && allConcerns[cn].targetIngredients.includes(prod.primaryIngredientId) ? allConcerns[cn].rationale : null)
      .filter(Boolean);

    if (!rationales.length && !studyLink && !prod.trialNote) return '';

    const rationaleText = rationales[0] || `${ingredient.name} is clinically studied for ${matchedConcerns.join(', ')}.`;
    const freshPillHTML = freshnessPillHTML(ingredient.last_refreshed);
    const badgeHTML = trialBadgeHTML(prod);
    const rxBadge   = rxBadgeHTML(prod);
    // If the product itself has a curated trial note (Tier 1 RCT-backed), show it after the rationale
    const trialNoteHTML = prod.trialNote
      ? `<p class="evidence-trial-note">📋 ${prod.trialNote}</p>`
      : '';
    // Rx callout — amber warning box with the prescribing context, only
    // shown for products that require a doctor's involvement.
    const consultDermHTML = prod.consultDermNote
      ? `<p class="evidence-rx-note">⚕ <strong>Prescription required.</strong> ${prod.consultDermNote}</p>`
      : '';

    const extraTrialsHTML = extraTrialLinks
      ? `<p class="evidence-extra-trials">More trials of this product: ${extraTrialLinks}</p>`
      : '';

    return `
      <div class="evidence-rationale">
        <div class="evidence-rationale-head">
          <div class="evidence-rationale-head-left">
            <p class="evidence-rationale-label">WHY THIS?</p>
            ${badgeHTML}
            ${rxBadge}
          </div>
          ${freshPillHTML}
        </div>
        <p class="evidence-rationale-body">${rationaleText} ${studyLink}</p>
        ${trialNoteHTML}
        ${consultDermHTML}
        ${extraTrialsHTML}
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
        <p class="prod-meta"><strong>active:</strong> ${ingredient ? ingredient.name : prod.primaryIngredientId}</p>
        <p class="prod-meta"><strong>fixes:</strong> ${prod.concerns.filter(c => userAnalysis.concerns.map(uc => uc.name).includes(c)).join(', ') || prod.concerns.join(', ')}</p>
        ${evidenceHTML}
        <div class="reaction-row">
          ${hasReaction ? `<span class="reaction-indicator" id="reaction-ind-${prod.id}">flagged</span>` : `<span class="reaction-indicator hidden" id="reaction-ind-${prod.id}">flagged</span>`}
          <button class="reaction-log-btn" onclick="window.openReactionModal('${prod.id}')" aria-label="Log a skin reaction to this product">report a reaction</button>
        </div>
      </div>
      <div class="step-actions">
        <button class="fav-btn${isFav ? ' fav-active' : ''}" onclick="window.toggleFavorite('${prod.id}', this)" aria-pressed="${isFav}" aria-label="${isFav ? 'unsave' : 'save'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${isFav ? 'saved' : 'save'}
        </button>
        <a href="${buyURL}" target="_blank" rel="sponsored noopener noreferrer" class="btn buy-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          Search on Amazon
        </a>
      </div>`;
  }

  function renderStep(containerId, label, products, regionData) {
    const container = document.getElementById(containerId);
    if (!container) return;

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
    if (!container) return;
    const m = containerId.match(/^(am|pm)-(\w+)$/);
    const slot = m ? m[1] : 'am';
    const key  = 'treatment';

    // Resolve which instances to render. If slotChoices already has entries,
    // honor them; otherwise show all owned treatments stacked.
    const existingChoices = (slotChoices[slot] && Array.isArray(slotChoices[slot][key]))
      ? slotChoices[slot][key].slice()
      : [];
    const instances = existingChoices.length
      ? existingChoices.map(c => products.find(p => p.id === c.id) || products[0])
      : products.slice();

    container.innerHTML = `
      <div class="step-label">${label}</div>
      <div class="treatment-stack" id="${containerId}-stack" style="margin-top: 1.5rem;">
        ${instances.map((prod, idx) => renderTreatmentInstance(slot, idx, prod, products, regionData)).join('')}
      </div>
      ${products.length > 1 ? `<div class="treatment-stack-actions">
        <button type="button" class="link-btn" onclick="window.addTreatment('${slot}', '${regionData.tld}')">+ layer another active</button>
      </div>` : ''}`;
  }

  function renderTreatmentInstance(slot, idx, prod, products, regionData) {
    const cardId = `${slot}-treatment-tx-${idx}`;
    let selectHTML = '';
    if (products.length > 1) {
      selectHTML = `<select class="product-picker" onchange="window.updateTreatment('${slot}', ${idx}, this.value, '${regionData.tld}')">`;
      products.forEach(p => {
        const sel = p.id === prod.id ? ' selected' : '';
        selectHTML += `<option value="${p.id}"${sel}>${p.brand} — ${p.name}</option>`;
      });
      selectHTML += `</select>`;
    }
    const removeBtn = idx > 0
      ? `<button type="button" class="treatment-remove-btn link-btn link-btn--muted" onclick="window.removeTreatment('${slot}', ${idx}, '${regionData.tld}')" aria-label="Remove this treatment">yeet</button>`
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
    const prod = allProducts.find(p => p.id === prodId);
    if (!prod) return;
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || { tld };
    const cardEl = document.getElementById(`${slot}-treatment-tx-${idx}-content`);
    if (cardEl) cardEl.innerHTML = buildProductCardHTML(prod, regionData);
    if (!slotChoices[slot]) slotChoices[slot] = {};
    if (!Array.isArray(slotChoices[slot].treatment)) slotChoices[slot].treatment = [];
    slotChoices[slot].treatment[idx] = { source: 'catalog', id: prodId };
    rebuildActiveStack();
    syncSlotChoices();
  };

  window.addTreatment = function (slot, tld) {
    if (!slotChoices[slot]) slotChoices[slot] = {};
    if (!Array.isArray(slotChoices[slot].treatment)) slotChoices[slot].treatment = [];
    // Pick a different owned treatment than what's already in the stack.
    const treatments = (slot === 'am' ? amTreatmentsCache : pmTreatmentsCache) || [];
    const usedIds = new Set(slotChoices[slot].treatment.map(c => c.id));
    const next = treatments.find(p => !usedIds.has(p.id)) || treatments[0];
    if (!next) return;
    slotChoices[slot].treatment.push({ source: 'catalog', id: next.id });
    syncSlotChoices();
    const regionData = Object.values(amazonRegions).find(r => r.tld === tld) || amazonRegions[currentRegionCode] || { tld };
    renderTreatmentStack(`${slot}-treatment`, 'step 2 — actives', treatments, regionData);
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
    renderTreatmentStack(`${slot}-treatment`, 'step 2 — actives', treatments, regionData);
    applySlotChoicesToUI();
    rebuildActiveStack();
  };

  // Caches so add/remove can re-render without re-running the lookup.
  let amTreatmentsCache = null;
  let pmTreatmentsCache = null;

  function rebuildActiveStack() {
    // Build _dermActiveStack from chosen products across all slots so the
    // conflict detector sees layered combinations. Falls back to whatever
    // is currently rendered for a slot when no choice is recorded.
    const stack = [];
    for (const slot of ['am', 'pm']) {
      for (const key of ['cleanser', 'treatment', 'moisturizer', 'sunscreen']) {
        if (slot === 'pm' && key === 'sunscreen') continue;
        const choices = slotChoices[slot]?.[key];
        if (Array.isArray(choices)) {
          choices.forEach(c => {
            const p = allProducts.find(pp => pp.id === c.id);
            if (p) stack.push(p);
          });
        } else if (choices && choices.id) {
          const p = allProducts.find(pp => pp.id === choices.id);
          if (p) stack.push(p);
        }
      }
    }
    if (stack.length) window._dermActiveStack = stack;
    if (typeof detectAndRenderConflicts === 'function') detectAndRenderConflicts();
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
      btn.setAttribute('aria-label', checked ? 'undo' : 'mark done');
      btn.innerHTML = checked
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> ate ✓'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg> did it';
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
    el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>&nbsp;<strong>${streak}</strong>&nbsp;days locked in`;
  }

  // ── Routine stats — pure computation kept in sync with backend/lib/routineStats.js ──
  const STATS_ROUTINE_STEPS = {
    am: ['cleanser', 'treatment', 'moisturizer', 'sunscreen'],
    pm: ['cleanser', 'treatment', 'moisturizer'],
  };
  const STATS_PER_DAY = STATS_ROUTINE_STEPS.am.length + STATS_ROUTINE_STEPS.pm.length; // 7
  const STEP_LABEL = { cleanser: 'wash', treatment: 'actives', moisturizer: 'moisturize', sunscreen: 'spf' };

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
          <span class="stats-meta-label">how locked in u are · last ${rangeDays} days</span>
          <span class="stats-meta-sub">${s.total_steps_completed}/${s.total_steps_possible} steps done</span>
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
      <span class="section-eyebrow">${rangeDays}-day adherence</span>
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
    { id: 'first-scan', label: 'first scan ✓',     check: ()     => true },
    { id: '3-day',      label: '3 days locked in', check: (s)    => s >= 3 },
    { id: '7-day',      label: 'week locked in',   check: (s)    => s >= 7 },
    { id: '30-day',     label: '30 days. sigma.',  check: (s)    => s >= 30 },
    { id: '5-faves',    label: '5 saved 🛍️',       check: (s, f) => f >= 5 },
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
    el.innerHTML = `<span class="section-eyebrow">trophies</span><div class="badges-grid">${
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
    btn.setAttribute('aria-label', isFav ? 'unsave' : 'save');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${isFav ? 'saved' : 'save'}`;
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
      <span class="section-eyebrow">⚠ ingredient conflicts</span>
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
      <span>48h patch test on <strong>${due.join(', ')}</strong> — face still alive?</span>
      <div class="patch-test-actions">
        <button class="btn btn-outline" style="padding:0.3rem 0.75rem;font-size:0.68rem;" onclick="window.dismissPatchTest(false)">all good</button>
        <button class="btn btn-primary" style="padding:0.3rem 0.75rem;font-size:0.68rem;" onclick="window.dismissPatchTest(true)">log a reaction</button>
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
      <span>almost out of <strong>${due.join(', ')}</strong></span>
      <a href="/dashboard.html#treatment" class="btn btn-primary" style="padding:0.3rem 0.875rem;font-size:0.68rem;margin-left:auto;">restock →</a>
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
      section.innerHTML = `<p class="photos-empty-msg">no pics yet — tick "save front pic" next time u scan.</p>`;
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
          <div class="section-eyebrow" style="margin-bottom:0.75rem;">before / after</div>
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
              <span class="photo-score-label">health</span>
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
        <div class="section-eyebrow" style="margin:0;">progress pics</div>
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
    if (!confirm('yeet this progress pic?')) return;
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
    const scanToggle  = document.getElementById('notif-scan-toggle');
    const scanRow     = document.getElementById('notif-scan-time-row');
    const scanInput   = document.getElementById('notif-scan-time');

    toggle.checked = prefs.enabled && Notification.permission === 'granted';
    amInput.value  = prefs.amTime;
    pmInput.value  = prefs.pmTime;
    if (toggle.checked) timesRow.classList.remove('hidden');

    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const granted = await NotifPrefs.enable();
        if (!granted) {
          toggle.checked = false;
          if (hint) hint.textContent = 'permission denied — enable notifs in browser settings.';
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
        if (p.enabled || p.scanEnabled) NotifPrefs.schedule();
      });
    });

    // Daily scan reminder — separate toggle, shares the browser permission.
    if (scanToggle && scanRow && scanInput) {
      scanToggle.checked = prefs.scanEnabled && Notification.permission === 'granted';
      scanInput.value    = prefs.scanTime;
      if (scanToggle.checked) scanRow.classList.remove('hidden');

      scanToggle.addEventListener('change', async () => {
        if (scanToggle.checked) {
          const granted = await NotifPrefs.enableScan();
          if (!granted) {
            scanToggle.checked = false;
            if (hint) hint.textContent = 'permission denied — enable notifs in browser settings.';
            return;
          }
          scanRow.classList.remove('hidden');
          if (hint) hint.textContent = '';
        } else {
          NotifPrefs.disableScan();
          scanRow.classList.add('hidden');
        }
      });

      scanInput.addEventListener('change', () => {
        const p = NotifPrefs.get();
        p.scanTime = scanInput.value;
        NotifPrefs.set(p);
        if (p.scanEnabled) NotifPrefs.schedule();
      });
    }
  }

  // ── Daily Scan + Quick Check-in CTAs ──────────────────────────────
  // Shows "Scanned today ✓" when there's already a scan stamped today.
  // Anonymous users see the buttons but the modal POST silently no-ops.
  function initDailyCtas() {
    const scanBtn   = document.getElementById('daily-scan-btn');
    const scanLabel = document.getElementById('daily-scan-btn-label');
    const checkinBtn = document.getElementById('quick-checkin-btn');

    if (scanBtn && scanLabel) {
      const stamp = userAnalysis?.savedAt;
      const isToday = stamp && (new Date(stamp).toDateString() === new Date().toDateString());
      if (isToday) {
        scanLabel.textContent = 'scanned today ✓ — re-scan';
        scanBtn.classList.remove('btn-primary');
        scanBtn.classList.add('btn-outline');
      }
    }

    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => {
        if (typeof LifestyleModal !== 'undefined') {
          LifestyleModal.open({});
        }
      });
    }
  }

  // ── F14 — Skin diary replaced by post-scan lifestyle-modal.js + Overview
  //         heatmaps in overview-trends.js (Phase 7 daily-scan flow).

  // ── F15 — Shareable routine card (Canvas → PNG) ───────────────────
  window.shareRoutineCard = async function () {
    const analysis = JSON.parse(localStorage.getItem('dermAI_analysis') || 'null');
    if (!analysis) { alert('no scan yet — go scan ur face first.'); return; }

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
    ctx.fillText('health score', 72, 330);

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
    ctx.fillText('fixing', 72, 470);

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
      ctx.fillText('days locked in', 72, 734);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.fillText('start ur streak today', 72, 650);
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
    const prod = allProducts.find(p => p.id === prodId);
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
      slotChoices[slot][key] = { source: 'catalog', id: prodId };
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

  async function renderWeatherFromLocation() {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) return;
    try {
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&current=temperature_2m,relative_humidity_2m,uv_index`);
      const weather = await weatherRes.json();
      const current = weather.current;

      const weatherDiv = document.getElementById('weather-widget');
      weatherDiv.innerHTML = `
        <div class="glass-panel" style="padding: 1.5rem; margin-bottom: 2rem;">
          <h4 style="margin-bottom:0.5rem; color:var(--primary-300);">🌤️ weather where u are (${userLocation.city || 'ur location'})</h4>
          <div style="display:flex; gap:2rem; flex-wrap:wrap; margin-top:1rem;">
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Current UV Index</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.uv_index} ${current.uv_index > 5 ? '<span style="color:var(--primary-700); font-size:1rem;">(high! double up on spf)</span>' : '<span style="color:#2a8a64; font-size:1rem;">(chill)</span>'}</p>
            </div>
            <div>
              <p style="font-size:0.875rem; color:var(--neutral-400);">Relative Humidity</p>
              <p style="font-size:1.25rem; font-weight:bold;">${current.relative_humidity_2m}% ${current.relative_humidity_2m < 40 ? '<span style="color:var(--primary-700); font-size:1rem;">(dry — drink water)</span>' : ''}</p>
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
