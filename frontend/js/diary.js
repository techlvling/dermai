// Skin diary section — water/stress/sleep log + 14-day chart.
// Lifted out of recommendations.js (Phase 6 IA revamp). Self-contained:
// owns its own localStorage helpers, renders into <section data-section="diary">,
// and is mounted lazily by dashboard.js's showSection() routing.
(function () {
  const DIARY_COLUMN = { water: 'water_liters', stress: 'stress_1_5', sleep: 'sleep_hours' };

  function sGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function sSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // One-shot local migration: water values > 5 are legacy "glasses" logged
  // before Phase 1 switched the unit to liters. Convert (~250ml/glass) so
  // they don't propagate to the server as 8 LITERS. Idempotent: new water
  // input is clamped to 0-5L, so values > 5 can only be legacy data.
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

  // Inline-onclick handlers — kept on window so the existing button HTML
  // continues to work without rewiring.
  window.saveDiaryField = function (field, value) {
    const today = todayKey();
    const diary  = sGet('dermAI_diary') || {};
    if (!diary[today]) diary[today] = {};
    diary[today][field] = value;
    sSet('dermAI_diary', diary);
    renderDiaryToday();
    renderDiaryChart();
    if (window.Storage && Storage.server && DIARY_COLUMN[field]) {
      Storage.server.post('/api/diary', {
        log_date: today,
        [DIARY_COLUMN[field]]: value,
      }).catch(() => {});
    }
  };

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

  function mount() {
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
    hydrateDiaryFromServer();
  }

  window.Diary = { mount };
})();
