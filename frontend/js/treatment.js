// Treatment — catalog browser with WHY THIS panels and "I have this" /
// "Remove from routine" toggle. Persists user's owned products to the
// user_routine_items table via /api/routine-items so the Routine page
// can render the daily checklist from that authoritative list.
//
// Loaded on dashboard.html and mounted by dashboard.js when the user
// navigates to data-section="treatment". Reads userAnalysis the same
// server-first way recommendations.js does, then builds a category-grouped
// catalog view.
window.Treatment = (function () {
  let _mounted = false;
  let _allProducts = [];
  let _allIngredients = [];
  let _allConcerns = {};
  let _userAnalysis = null;
  let _ownedItems = [];   // /api/routine-items rows
  let _activeFilter = 'recommended'; // 'recommended' | 'all' | 'owned'

  async function mount() {
    if (_mounted) {
      _refresh();
      return;
    }
    _mounted = true;

    // 1. Pull user's analysis (server-first, same pattern as recommendations.js)
    const loggedIn = window.Storage ? await Storage.isLoggedIn() : false;
    let analysis = null;
    if (loggedIn) {
      const latest = await Storage.fetchLatestScan();
      if (latest?.result_json) analysis = latest.result_json;
    }
    if (!analysis) {
      const local = localStorage.getItem('dermAI_analysis');
      if (local) { try { analysis = JSON.parse(local); } catch (_) {} }
    }
    _userAnalysis = analysis;

    // 2. Load catalog + user's owned items in parallel
    try {
      const [prodRes, ingRes, conRes, ownedRes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/ingredients').then(r => r.json()),
        fetch('/api/concerns').then(r => r.json()),
        loggedIn ? Storage.server.get('/api/routine-items') : Promise.resolve({ items: [] }),
      ]);
      _allProducts = prodRes;
      _allIngredients = ingRes;
      _allConcerns = conRes;
      _ownedItems = ownedRes?.items || [];
    } catch (e) {
      console.warn('[Treatment] failed to load catalog:', e);
    }

    _renderShell();
    _renderProducts();
  }

  // Force-refresh when user navigates back to Treatment after a scan.
  async function _refresh() {
    if (!window.Storage) return;
    const loggedIn = await Storage.isLoggedIn();
    if (loggedIn) {
      const latest = await Storage.fetchLatestScan();
      if (latest?.result_json) _userAnalysis = latest.result_json;
      const ownedRes = await Storage.server.get('/api/routine-items');
      _ownedItems = ownedRes?.items || [];
    }
    _renderProducts();
  }

  function _renderShell() {
    const root = document.getElementById('treatment-root');
    if (!root) return;
    root.innerHTML = `
      <div class="tx-header">
        <div>
          <h1>shit to put on <span class="gradient-text">ur face</span></h1>
          <p class="tx-sub">products that actually work for ur face. tap <strong>got this</strong> on anything u own — it'll show in ur daily routine.</p>
        </div>
        <div class="tx-filters">
          <button class="tx-filter-btn active" data-filter="recommended">for u</button>
          <button class="tx-filter-btn" data-filter="all">everything</button>
          <button class="tx-filter-btn" data-filter="owned">what i own</button>
        </div>
      </div>
      <div id="treatment-no-analysis" class="hidden tx-empty"></div>
      <div id="treatment-categories"></div>
    `;

    root.querySelectorAll('.tx-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeFilter = btn.dataset.filter;
        root.querySelectorAll('.tx-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        _renderProducts();
      });
    });
  }

  function _renderProducts() {
    const noAnalysisEl = document.getElementById('treatment-no-analysis');
    const catsEl       = document.getElementById('treatment-categories');
    if (!catsEl) return;

    if (!_userAnalysis && _activeFilter === 'recommended') {
      noAnalysisEl.classList.remove('hidden');
      noAnalysisEl.innerHTML = `
        <h2>scan first bestie</h2>
        <p>take a 3-pic scan and we'll show products matched to ur concerns.</p>
        <a href="/analyze.html" class="btn btn-primary">scan ur shit</a>
        <p style="margin-top:1rem; font-size:0.875rem; color:var(--neutral-500);">
          or just <button class="link-btn" id="tx-show-all">browse everything</button> instead.
        </p>
      `;
      catsEl.innerHTML = '';
      const showAll = document.getElementById('tx-show-all');
      if (showAll) showAll.addEventListener('click', () => {
        _activeFilter = 'all';
        document.querySelectorAll('.tx-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
        _renderProducts();
      });
      return;
    }
    noAnalysisEl.classList.add('hidden');

    // Filter products by active mode
    let visible = [..._allProducts];
    if (_activeFilter === 'recommended' && _userAnalysis) {
      const userConcernNames = new Set((_userAnalysis.concerns || []).map(c => c.name));
      visible = visible.filter(p => p.concerns.some(c => userConcernNames.has(c)));
    } else if (_activeFilter === 'owned') {
      const ownedProductIds = new Set(_ownedItems.map(i => i.product_id));
      visible = visible.filter(p => ownedProductIds.has(p.id));
    }

    // Rank within filter (severity × ingredient.evidenceTier × productTierWeight × brandWeight)
    visible = _rankProducts(visible);

    // Group by category
    const byCat = { cleanser: [], treatment: [], moisturizer: [], sunscreen: [] };
    visible.forEach(p => { if (byCat[p.category]) byCat[p.category].push(p); });

    if (visible.length === 0) {
      catsEl.innerHTML = `
        <div class="tx-empty">
          <h2>nothing here fr</h2>
          <p>${_activeFilter === 'owned'
            ? 'u haven\'t added anything yet. switch to <strong>for u</strong> and tap <strong>got this</strong> on stuff u own.'
            : 'try <strong>everything</strong> to see the full catalog.'}</p>
        </div>`;
      return;
    }

    const labels = {
      cleanser: 'wash ur face',
      treatment: 'the actives (where the magic happens)',
      moisturizer: 'moisturizers',
      sunscreen: 'spf (non-negotiable)',
    };

    catsEl.innerHTML = ['cleanser', 'treatment', 'moisturizer', 'sunscreen']
      .filter(cat => byCat[cat].length > 0)
      .map(cat => {
        const items = byCat[cat];
        // Only mark a top pick + show the budget subtitle when there's a real
        // choice to make. Single-item categories ARE the pick by default.
        const showSubtitle = items.length > 1;
        return `
        <section class="tx-cat">
          <h2 class="tx-cat-title">${labels[cat]} <span class="tx-cat-count">${items.length}</span></h2>
          ${showSubtitle ? `<p class="tx-cat-subtitle">start with #1. the rest are solid alternates if budget or stock is tight.</p>` : ''}
          <div class="tx-grid">
            ${items.map((p, i) => _buildProductCardHTML(p, i === 0 && showSubtitle)).join('')}
          </div>
        </section>
      `;}).join('');

    // Wire toggle buttons
    catsEl.querySelectorAll('[data-tx-toggle]').forEach(btn => {
      btn.addEventListener('click', () => _toggleOwned(btn.dataset.txToggle, btn));
    });
  }

  function _rankProducts(products) {
    const PRODUCT_TIER_WEIGHT = { 1: 1.6, 2: 1.25, 3: 1.0, 4: 0.8 };
    const BRAND_WEIGHT = {
      'SkinCeuticals': 1.10, 'La Roche-Posay': 1.08, 'Avene': 1.07,
      'CeraVe': 1.06, 'Eucerin': 1.06, 'EltaMD': 1.07, 'Galderma': 1.10,
      'PanOxyl': 1.08, 'Bioderma': 1.05, 'Cetaphil': 1.05,
      'Aveeno': 1.04, 'Neutrogena': 1.03, "Paula's Choice": 1.04,
      'RoC': 1.06, 'Sebamed': 1.04, 'Curatio': 1.05, 'Brinton': 1.05,
      'Micro Labs': 1.05, 'Intas': 1.05,
    };
    const concerns = _userAnalysis?.concerns || [];
    return [...products].sort((a, b) => {
      const score = (p) => {
        const ing = _allIngredients.find(i => i.id === p.primaryIngredientId);
        const ingTier = ing ? ing.evidenceTier : 1;
        const maxSev = concerns.filter(c => p.concerns.includes(c.name)).reduce((m, c) => Math.max(m, c.severity || 0), 0) || 50;
        const pw = PRODUCT_TIER_WEIGHT[p.productEvidenceTier] || 1.0;
        const bw = BRAND_WEIGHT[p.brand] || 1.0;
        return maxSev * ingTier * pw * bw;
      };
      return score(b) - score(a);
    });
  }

  function _isOwned(prod) {
    return _ownedItems.some(i =>
      i.product_id === prod.id &&
      i.slot === prod.category &&
      (i.time_of_day === prod.bestTimeOfDay || i.time_of_day === 'both' || prod.bestTimeOfDay === 'both')
    );
  }

  function _ownedRowFor(prod) {
    return _ownedItems.find(i =>
      i.product_id === prod.id && i.slot === prod.category
    );
  }

  async function _toggleOwned(productId, btn) {
    const prod = _allProducts.find(p => p.id === productId);
    if (!prod) return;
    const owned = _ownedRowFor(prod);
    btn.disabled = true;
    if (owned) {
      // Remove
      const ok = await Storage.server.delete('/api/routine-items/' + owned.id);
      if (ok !== false) {
        _ownedItems = _ownedItems.filter(i => i.id !== owned.id);
      }
    } else {
      // Add
      const result = await Storage.server.post('/api/routine-items', {
        product_id: prod.id,
        slot: prod.category,
        time_of_day: prod.bestTimeOfDay,
      });
      if (result?.item) _ownedItems.push(result.item);
    }
    btn.disabled = false;
    _renderProducts();
  }

  // ── Card rendering (self-contained — duplicated from recommendations.js
  //   intentionally so each page can evolve independently) ───────────────────
  function _buildProductCardHTML(prod, isTopPick = false) {
    const ingredient = _allIngredients.find(i => i.id === prod.primaryIngredientId);
    const owned = !!_ownedRowFor(prod);
    const evidenceTier = ingredient?.evidenceTier ?? '?';

    const evidenceHTML = _buildEvidenceHTML(prod, ingredient);

    return `
      <div class="tx-card${isTopPick ? ' tx-card--top' : ''}">
        ${isTopPick ? '<span class="tx-pick-badge">our pick</span>' : ''}
        <div class="tx-card-head">
          <div>
            <div class="tx-card-brand">${prod.brand}</div>
            <div class="tx-card-name">${prod.name}</div>
          </div>
          <span class="badge badge-tier-${evidenceTier}">${evidenceTier === 1 ? 'Tier 1 RCT' : evidenceTier === 2 ? 'Tier 2' : 'Tier 3'}</span>
        </div>
        <div class="tx-card-meta">
          <span class="tx-meta-item"><strong>active:</strong> ${ingredient ? ingredient.name : prod.primaryIngredientId}</span>
          <span class="tx-meta-item"><strong>use:</strong> ${prod.bestTimeOfDay === 'both' ? 'AM &amp; PM' : prod.bestTimeOfDay}</span>
          <span class="tx-meta-item">${prod.priceTier || ''}</span>
        </div>
        ${evidenceHTML}
        <div class="tx-card-actions">
          <button class="btn ${owned ? 'btn-outline' : 'btn-primary'} tx-toggle-btn" data-tx-toggle="${prod.id}">
            ${owned ? '✓ in routine — yeet it' : '+ got this one'}
          </button>
          <a href="https://www.amazon.in/s?k=${encodeURIComponent(prod.brand + ' ' + prod.name)}" target="_blank" rel="sponsored noopener noreferrer" class="btn buy-btn-small">
            find on amazon →
          </a>
        </div>
      </div>`;
  }

  function _buildEvidenceHTML(prod, ingredient) {
    if (!ingredient) return '';
    const userConcernNames = (_userAnalysis?.concerns || []).map(c => c.name);
    const matchedConcerns = prod.concerns.filter(pc => userConcernNames.includes(pc));

    const study = (Array.isArray(prod.productTrials) && prod.productTrials.length)
      ? prod.productTrials[0]
      : (ingredient.keyStudies && ingredient.keyStudies[0]);
    const studyLink = study
      ? `<a href="${study.link}" target="_blank" rel="noopener noreferrer" class="tx-pmid">[PMID ${study.pubmedId}]</a>`
      : '';

    const rationales = matchedConcerns
      .map(cn => _allConcerns[cn] && _allConcerns[cn].targetIngredients.includes(prod.primaryIngredientId) ? _allConcerns[cn].rationale : null)
      .filter(Boolean);
    const rationaleText = rationales[0]
      || (matchedConcerns.length
        ? `${ingredient.name} is clinically studied for ${matchedConcerns.join(', ')}.`
        : `${ingredient.name} — see ingredient evidence panel for general clinical use.`);

    const badgeHTML = _trialBadgeHTML(prod);
    const rxBadge = _rxBadgeHTML(prod);
    const freshPill = _freshnessPillHTML(ingredient.last_refreshed);
    const trialNote = prod.trialNote ? `<p class="evidence-trial-note">📋 ${prod.trialNote}</p>` : '';
    const consultDerm = prod.consultDermNote
      ? `<p class="evidence-rx-note">⚕ <strong>Prescription required.</strong> ${prod.consultDermNote}</p>`
      : '';
    const extraTrials = (Array.isArray(prod.productTrials) && prod.productTrials.length > 1)
      ? `<p class="evidence-extra-trials">More trials: ${prod.productTrials.slice(1, 3).map(t => `<a href="${t.link}" target="_blank" rel="noopener noreferrer">[PMID ${t.pubmedId}]</a>`).join(' · ')}</p>`
      : '';

    return `
      <div class="evidence-rationale">
        <div class="evidence-rationale-head">
          <div class="evidence-rationale-head-left">
            <p class="evidence-rationale-label">WHY THIS?</p>
            ${badgeHTML}
            ${rxBadge}
          </div>
          ${freshPill}
        </div>
        <p class="evidence-rationale-body">${rationaleText} ${studyLink}</p>
        ${trialNote}
        ${consultDerm}
        ${extraTrials}
      </div>`;
  }

  function _trialBadgeHTML(prod) {
    const tier = prod.productEvidenceTier || 3;
    if (tier === 1) return '<span class="trial-badge trial-badge--top">RCT-tested</span>';
    if (tier === 2) return '<span class="trial-badge trial-badge--mid">Claims-studied</span>';
    if (tier === 4) return '<span class="trial-badge trial-badge--low">Ingredient-only</span>';
    return '';
  }

  function _rxBadgeHTML(prod) {
    if (!prod.requiresPrescription) return '';
    return '<span class="trial-badge trial-badge--rx">⚕ Rx</span>';
  }

  function _freshnessPillHTML(lastRefreshed) {
    let cls, text;
    if (!lastRefreshed) { cls = 'fresh-stale'; text = 'Not yet checked'; }
    else {
      const days = Math.floor((Date.now() - new Date(lastRefreshed).getTime()) / 86400000);
      if (days < 14) { cls = 'fresh-good'; text = days === 0 ? 'Refreshed today' : `Fresh · ${days}d`; }
      else if (days < 60) { cls = 'fresh-aging'; text = `Aging · ${days}d`; }
      else { cls = 'fresh-stale'; text = `Stale · ${days}d`; }
    }
    return `<span class="freshness-pill ${cls}">${text}</span>`;
  }

  return { mount };
})();
