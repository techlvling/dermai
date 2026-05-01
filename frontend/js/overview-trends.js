// Overview trends — 6 stacked heatmaps (water / sleep / stress / sun /
// alcohol / wellness), wellness-today stat card, correlation insight.
// Mounted by dashboard.js when Overview is rendered. Reads from
// localStorage `dermAI_diary` and hydrates from /api/diary on first mount.
window.OverviewTrends = (function () {
  let _hydrated = false;
  let _scans = [];      // populated when correlation insight wants scan_health joins

  function sGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function sSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // ── Per-metric normalisation: value → 0..3 level for the heatmap cell.
  //    Each metric defines what counts as "good" so the scale stays honest:
  //    e.g. low stress is the GOOD end (level 3 = darker red would be bad,
  //    but here we use red intensity to mean "stress level itself" so dark
  //    red = high stress). For wellness, dark green = good.
  const METRIC_DEFS = {
    water: {
      label: 'WATER',
      colorClass: 'trends-color-water',
      level: v => v == null ? 0 : v < 0.5 ? 1 : v < 1.5 ? 2 : 3,
      title: v => v == null ? 'no log' : `${v} L`,
    },
    sleep: {
      label: 'SLEEP',
      colorClass: 'trends-color-sleep',
      level: v => v == null ? 0 : v < 6 ? 1 : v < 8 ? 2 : 3,
      title: v => v == null ? 'no log' : `${v} h`,
    },
    stress: {
      label: 'STRESS',
      // higher value = higher stress = darker
      colorClass: 'trends-color-stress',
      level: v => v == null ? 0 : v <= 2 ? 1 : v === 3 ? 2 : 3,
      title: v => v == null ? 'no log' : `${v}/5`,
    },
    sun: {
      label: 'SUN',
      colorClass: 'trends-color-sun',
      // sweet spot 15-60 = level 3, 60-120 = 2, 5-15 or >120 = 1, 0 = 0
      level: v => {
        if (v == null) return 0;
        if (v >= 15 && v <= 60) return 3;
        if (v > 60 && v <= 120) return 2;
        if (v > 0 && v < 15) return 1;
        if (v > 120) return 1;
        return 0;
      },
      title: v => v == null ? 'no log' : `${v} min`,
    },
    alcohol: {
      label: 'ALCOHOL',
      colorClass: 'trends-color-alcohol',
      level: v => v == null ? 0 : v === 0 ? 0 : v === 1 ? 1 : v === 2 ? 2 : 3,
      title: v => v == null ? 'no log' : `${v} drinks`,
    },
    wellness: {
      label: 'WELLNESS',
      colorClass: 'trends-color-wellness',
      level: v => v == null ? 0 : v < 40 ? 1 : v < 70 ? 2 : 3,
      title: v => v == null ? 'no log' : `${v}/100`,
    },
  };

  // Compute wellness from a diary entry — fallback for historical rows
  // that don't have a stored wellness_score (pre-Phase-7 data).
  function deriveWellness(entry) {
    if (entry.wellness != null) return entry.wellness;
    if (typeof LifestyleModal !== 'undefined' && typeof LifestyleModal.computeWellness === 'function') {
      return LifestyleModal.computeWellness(entry);
    }
    return null;
  }

  async function hydrateFromServer() {
    if (_hydrated) return;
    _hydrated = true;
    if (!window.Storage || !Storage.server) return;
    try {
      const loggedIn = await Storage.isLoggedIn();
      if (!loggedIn) return;
      const body = await Storage.server.get('/api/diary');
      if (!body || !Array.isArray(body.entries)) return;
      const local = sGet('dermAI_diary') || {};
      let changed = false;
      for (const row of body.entries) {
        const slot = local[row.log_date] || {};
        if (row.water_liters    != null && slot.water    === undefined) { slot.water    = Number(row.water_liters);    changed = true; }
        if (row.stress_1_5      != null && slot.stress   === undefined) { slot.stress   = Number(row.stress_1_5);      changed = true; }
        if (row.sleep_hours     != null && slot.sleep    === undefined) { slot.sleep    = Number(row.sleep_hours);     changed = true; }
        if (row.sun_minutes     != null && slot.sun      === undefined) { slot.sun      = Number(row.sun_minutes);     changed = true; }
        if (row.alcohol_drinks  != null && slot.alcohol  === undefined) { slot.alcohol  = Number(row.alcohol_drinks);  changed = true; }
        if (Array.isArray(row.symptoms) && !slot.symptoms)              { slot.symptoms = row.symptoms;                 changed = true; }
        if (row.wellness_score  != null && slot.wellness === undefined) { slot.wellness = Number(row.wellness_score);  changed = true; }
        local[row.log_date] = slot;
      }
      if (changed) sSet('dermAI_diary', local);
    } catch (_) { /* silent */ }
  }

  // Load scan history (used by correlation insight). Server-first if logged in.
  async function loadScans() {
    if (window.Storage && Storage.server) {
      try {
        if (await Storage.isLoggedIn()) {
          const body = await Storage.server.get('/api/scans');
          if (body?.scans) {
            _scans = body.scans.map(s => ({
              date: s.created_at?.slice(0, 10),
              health: s.result_json?.overallHealth ?? null,
            })).filter(s => s.date && s.health != null);
            return;
          }
        }
      } catch (_) {}
    }
    // Fallback to local history
    const hist = JSON.parse(localStorage.getItem('dermAI_history') || '[]');
    _scans = hist.map(h => ({
      date: (h.date || '').slice(0, 10),
      health: h.analysis?.overallHealth ?? h.overallHealth ?? null,
    })).filter(s => s.date && s.health != null);
  }

  function getRange() {
    const stored = parseInt(localStorage.getItem('dermAI_trendsRange') || '30', 10);
    return [30, 90, 365].includes(stored) ? stored : 30;
  }

  function setRange(days) {
    if (![30, 90, 365].includes(days)) days = 30;
    localStorage.setItem('dermAI_trendsRange', String(days));
    document.querySelectorAll('#trends-range-toggle button').forEach(btn => {
      const sel = parseInt(btn.dataset.range, 10) === days;
      btn.classList.toggle('active', sel);
      btn.setAttribute('aria-selected', String(sel));
    });
    renderRows(days);
  }

  function renderRows(rangeDays) {
    const rowsEl = document.getElementById('trends-rows');
    if (!rowsEl) return;
    const diary = sGet('dermAI_diary') || {};

    // Build per-day entries (oldest → newest), filling in missing days with empty.
    const days = [];
    const today = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const e = diary[key] || {};
      days.push({
        date: key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        water:    typeof e.water === 'number'   ? e.water   : null,
        sleep:    typeof e.sleep === 'number'   ? e.sleep   : null,
        stress:   typeof e.stress === 'number'  ? e.stress  : null,
        sun:      typeof e.sun === 'number'     ? e.sun     : null,
        alcohol:  typeof e.alcohol === 'number' ? e.alcohol : null,
        wellness: deriveWellness(e),
      });
    }

    const sizeClass = rangeDays === 30 ? 'range-30' : rangeDays === 90 ? 'range-90' : 'range-365';

    rowsEl.innerHTML = ['water', 'sleep', 'stress', 'sun', 'alcohol', 'wellness'].map(metric => {
      const def = METRIC_DEFS[metric];
      const cells = days.map(d => {
        const v = d[metric];
        const lvl = def.level(v);
        return `<div class="trends-cell ${def.colorClass} level-${lvl}" title="${d.label}: ${def.title(v)}"></div>`;
      }).join('');
      return `
        <div class="trends-row">
          <div class="trends-row-label">${def.label}</div>
          <div class="trends-row-cells ${sizeClass}">${cells}</div>
        </div>`;
    }).join('');

    renderWellnessStatCard(diary[todayKey()]);
    renderCorrelation(days);
  }

  function renderWellnessStatCard(todayEntry) {
    const el = document.getElementById('stat-wellness');
    if (!el) return;
    const w = todayEntry ? deriveWellness(todayEntry) : null;
    el.textContent = w == null ? '—' : String(w);
  }

  // ── Correlation insight: needs ≥14 days of scan+lifestyle overlap ──
  // Uses simple Pearson correlation; surfaces the strongest negative link
  // between any lifestyle metric and same-day skin-health score.
  function renderCorrelation(days) {
    const card = document.getElementById('trends-correlation');
    if (!card) return;

    // Join lifestyle days to scan days by date.
    const scansByDate = new Map(_scans.map(s => [s.date, s.health]));
    const joined = days
      .map(d => ({ ...d, health: scansByDate.get(d.date) ?? null }))
      .filter(d => d.health != null);

    if (joined.length < 14) {
      card.classList.add('hidden');
      return;
    }

    const insights = [];
    const tryMetric = (key, label, comparator, threshold, comparisonText) => {
      const matching = joined.filter(d => d[key] != null && comparator(d[key], threshold));
      const others   = joined.filter(d => d[key] != null && !comparator(d[key], threshold));
      if (matching.length < 3 || others.length < 3) return;
      const avgM = matching.reduce((a, d) => a + d.health, 0) / matching.length;
      const avgO = others.reduce((a, d) => a + d.health, 0) / others.length;
      const delta = Math.round(avgM - avgO);
      if (Math.abs(delta) < 4) return; // not interesting
      insights.push({
        label, delta, n: matching.length,
        text: `On days you ${comparisonText}, your skin scored <strong>${Math.abs(delta)} points ${delta < 0 ? 'lower' : 'higher'}</strong> than other days (across ${matching.length} observed days).`,
      });
    };

    tryMetric('sleep',    'sleep_low',    (v, t) => v < t, 6,   'slept under 6 hours');
    tryMetric('water',    'water_low',    (v, t) => v < t, 1.5, 'drank less than 1.5 L of water');
    tryMetric('stress',   'stress_high',  (v, t) => v >= t, 4,  'rated stress 4 or 5');
    tryMetric('alcohol',  'alcohol_any',  (v, t) => v >= t, 2,  'had 2+ drinks');
    tryMetric('sun',      'sun_low',      (v, t) => v < t, 5,   'spent under 5 min outside');

    if (insights.length === 0) {
      card.classList.add('hidden');
      return;
    }

    // Sort: rank by absolute delta (biggest swings first)
    insights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const top = insights.slice(0, 3);
    let idx = 0;
    function show() {
      card.innerHTML = `
        <div class="correlation-eyebrow">PATTERN SPOTTED</div>
        <p class="correlation-body">${top[idx].text}</p>
        ${top.length > 1 ? `<div class="correlation-dots">${top.map((_, i) => `<span class="${i === idx ? 'active' : ''}"></span>`).join('')}</div>` : ''}`;
    }
    show();
    card.classList.remove('hidden');
    if (top.length > 1) {
      // Auto-rotate every 8s. Clear any previous interval first.
      if (card._rotateTimer) clearInterval(card._rotateTimer);
      card._rotateTimer = setInterval(() => {
        idx = (idx + 1) % top.length;
        show();
      }, 8000);
    }
  }

  function renderShell() {
    const root = document.getElementById('overview-trends-root');
    if (!root) return;
    if (root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';
    root.innerHTML = `
      <section class="trends-panel">
        <div class="trends-header">
          <h2>Your trends</h2>
          <div class="range-toggle" id="trends-range-toggle" role="tablist" aria-label="Trends range">
            <button type="button" data-range="30" role="tab" aria-selected="true" class="active">30 DAYS</button>
            <button type="button" data-range="90" role="tab" aria-selected="false">90 DAYS</button>
            <button type="button" data-range="365" role="tab" aria-selected="false">YEAR</button>
          </div>
        </div>
        <div class="trends-rows" id="trends-rows"></div>
        <div class="trends-correlation hidden" id="trends-correlation"></div>
      </section>`;
    const toggle = document.getElementById('trends-range-toggle');
    toggle.addEventListener('click', e => {
      const btn = e.target.closest('button[data-range]');
      if (!btn) return;
      setRange(parseInt(btn.dataset.range, 10));
    });
  }

  async function mount() {
    renderShell();
    await Promise.all([hydrateFromServer(), loadScans()]);
    setRange(getRange());
  }

  return { mount };
})();
