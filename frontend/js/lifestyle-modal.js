// Lifestyle modal — water / sleep / stress / sun / alcohol + symptom chips.
// Shared by two surfaces:
//   1. Auto-opens after a scan (called by upload.js with scanId).
//   2. Opens via "Quick Check-in" button on Routine (no scanId).
//
// Persists to localStorage immediately AND POSTs to /api/diary so the
// Overview heatmaps reflect the entry without waiting for a network round
// trip. Computes a 0-100 wellness_score client-side and persists it too.
window.LifestyleModal = (function () {
  const SYMPTOMS = [
    { id: 'acne_flare', label: 'acne flare' },
    { id: 'dryness',    label: 'dry asf' },
    { id: 'redness',    label: 'red' },
    { id: 'irritation', label: 'irritated' },
    { id: 'breakout',   label: 'breakout' },
  ];

  // ── Helpers ─────────────────────────────────────────────────────────
  function sGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function sSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // One-shot legacy water migration (was in diary.js) — values >5 came from
  // the pre-Phase-1 "glasses" unit. Idempotent: new water input is clamped.
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

  // Wellness score: average of available normalised metric scores.
  // Each metric maps to 0-100; missing metrics drop out of the mean.
  // Tuned to reward "moderate everything" rather than perfection.
  function computeWellness(e) {
    const parts = [];
    if (typeof e.water === 'number')  parts.push(Math.min(100, Math.round((e.water / 2.5) * 100)));
    if (typeof e.sleep === 'number')  parts.push(Math.min(100, Math.round((e.sleep / 8) * 100)));
    if (typeof e.stress === 'number') parts.push(Math.round(((5 - e.stress) / 4) * 100));
    if (typeof e.sun === 'number') {
      // 15-60 min outside is ideal; 0 or >120 takes a hit.
      let s;
      if (e.sun >= 15 && e.sun <= 60) s = 100;
      else if (e.sun > 60 && e.sun <= 120) s = 75;
      else if (e.sun >= 5 && e.sun < 15) s = 60;
      else if (e.sun > 120) s = 50;
      else s = 30; // 0-5 minutes — basically no sun exposure
      parts.push(s);
    }
    if (typeof e.alcohol === 'number') {
      parts.push(e.alcohol === 0 ? 100 : e.alcohol === 1 ? 75 : e.alcohol === 2 ? 55 : 25);
    }
    if (parts.length === 0) return null;
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  }

  // ── Modal shell — injected into <body> on first open if not present ──
  function ensureShell() {
    let modal = document.getElementById('lifestyle-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'lifestyle-modal';
    modal.className = 'modal-overlay hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'lifestyle-modal-title');
    modal.innerHTML = `
      <div class="modal-panel lifestyle-modal-panel">
        <div class="modal-header">
          <h3 id="lifestyle-modal-title">how's today</h3>
          <button class="modal-close" id="lifestyle-skip-btn" aria-label="Skip for today">nah skip</button>
        </div>
        <div class="modal-body lifestyle-modal-body" id="lifestyle-body"></div>
        <div class="modal-footer lifestyle-modal-footer">
          <button class="btn btn-outline" id="lifestyle-yesterday-btn">same as yesterday lol</button>
          <button class="btn btn-primary" id="lifestyle-save-btn">log it</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function close(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ── Render the form body for a given entry shape ────────────────────
  function renderBody(entry) {
    const e = entry || {};
    const sympSet = new Set(e.symptoms || []);
    return `
      <div class="lifestyle-field">
        <span class="lifestyle-field-label">h2o today</span>
        <div class="lifestyle-row">
          <input type="number" id="lf-water" min="0" max="5" step="0.25"
                 value="${e.water ?? ''}" placeholder="0.0" />
          <span class="lifestyle-goal">of 2.5L goal</span>
        </div>
        <div class="lifestyle-chips">
          <button class="lifestyle-chip" data-add-water="0.25">+250 ml</button>
          <button class="lifestyle-chip" data-add-water="0.5">+500 ml</button>
          <button class="lifestyle-chip" data-add-water="1">+1 L</button>
        </div>
      </div>

      <div class="lifestyle-field">
        <span class="lifestyle-field-label">sleep hrs</span>
        <div class="lifestyle-chips">
          ${[5,6,7,8,9,10].map(v =>
            `<button class="lifestyle-chip${e.sleep === v ? ' active' : ''}" data-set-sleep="${v}">${v}</button>`
          ).join('')}
        </div>
      </div>

      <div class="lifestyle-field">
        <span class="lifestyle-field-label">stress (1–5)</span>
        <div class="lifestyle-chips">
          ${[1,2,3,4,5].map(v =>
            `<button class="lifestyle-chip${e.stress === v ? ' active' : ''}" data-set-stress="${v}">${v}</button>`
          ).join('')}
        </div>
        <div class="lifestyle-scale-label"><span>1 = chillin</span><span>5 = losing it</span></div>
      </div>

      <div class="lifestyle-field">
        <span class="lifestyle-field-label">sun (min outside)</span>
        <div class="lifestyle-row">
          <input type="number" id="lf-sun" min="0" max="720" step="5" value="${e.sun ?? ''}" placeholder="0" />
          <span class="lifestyle-goal">15–60 min is the sweet spot</span>
        </div>
        <div class="lifestyle-chips">
          ${[15, 30, 60, 90].map(v =>
            `<button class="lifestyle-chip${e.sun === v ? ' active' : ''}" data-set-sun="${v}">${v}</button>`
          ).join('')}
        </div>
      </div>

      <div class="lifestyle-field">
        <span class="lifestyle-field-label">drinks today</span>
        <div class="lifestyle-chips">
          ${[0,1,2,3].map(v =>
            `<button class="lifestyle-chip${e.alcohol === v ? ' active' : ''}" data-set-alcohol="${v}">${v === 3 ? '3+' : v}</button>`
          ).join('')}
        </div>
      </div>

      <div class="lifestyle-field">
        <span class="lifestyle-field-label">anything weird? (tap any)</span>
        <div class="lifestyle-chips lifestyle-chips--symptoms">
          ${SYMPTOMS.map(s =>
            `<button class="lifestyle-chip${sympSet.has(s.id) ? ' active' : ''}" data-toggle-symptom="${s.id}">${s.label}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  // ── Read live form values back into a normalised entry object ──────
  function readForm(modal) {
    const e = {};
    const water = modal.querySelector('#lf-water').value;
    if (water !== '') e.water = +parseFloat(water).toFixed(2);
    const sun = modal.querySelector('#lf-sun').value;
    if (sun !== '') e.sun = parseInt(sun, 10);

    const sleepBtn = modal.querySelector('[data-set-sleep].active');
    if (sleepBtn) e.sleep = parseInt(sleepBtn.dataset.setSleep, 10);
    const stressBtn = modal.querySelector('[data-set-stress].active');
    if (stressBtn) e.stress = parseInt(stressBtn.dataset.setStress, 10);
    const sunBtn = modal.querySelector('[data-set-sun].active');
    // Don't override numeric input if it's set
    if (sunBtn && e.sun == null) e.sun = parseInt(sunBtn.dataset.setSun, 10);
    const alcoholBtn = modal.querySelector('[data-set-alcohol].active');
    if (alcoholBtn) e.alcohol = parseInt(alcoholBtn.dataset.setAlcohol, 10);

    const symptoms = Array.from(modal.querySelectorAll('[data-toggle-symptom].active'))
      .map(b => b.dataset.toggleSymptom);
    if (symptoms.length) e.symptoms = symptoms;
    return e;
  }

  // ── Wire chip handlers (single-select for sleep/stress/sun/alcohol,
  //    multi-select for symptoms, additive for water) ──────────────────
  function wireBody(modal) {
    const body = modal.querySelector('#lifestyle-body');
    body.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLButtonElement)) return;
      ev.preventDefault();
      // Single-select chip groups
      for (const attr of ['data-set-sleep', 'data-set-stress', 'data-set-sun', 'data-set-alcohol']) {
        if (t.hasAttribute(attr)) {
          body.querySelectorAll(`[${attr}]`).forEach(b => b.classList.remove('active'));
          t.classList.add('active');
          if (attr === 'data-set-sun') {
            // Sync the number input to the selected chip
            const inp = modal.querySelector('#lf-sun');
            if (inp) inp.value = t.dataset.setSun;
          }
          return;
        }
      }
      // Symptoms multi-toggle
      if (t.hasAttribute('data-toggle-symptom')) {
        t.classList.toggle('active');
        return;
      }
      // Water +increment chips
      if (t.hasAttribute('data-add-water')) {
        const inp = modal.querySelector('#lf-water');
        const cur = parseFloat(inp.value) || 0;
        const next = Math.min(5, +(cur + parseFloat(t.dataset.addWater)).toFixed(2));
        inp.value = next;
        return;
      }
    });
  }

  // ── Public open() — main entry point ────────────────────────────────
  // Options:
  //   scanId   — bigint, links the entry to the scan that triggered it
  //   prefill  — entry shape (water/sleep/stress/sun/alcohol/symptoms) to pre-populate
  //   onSave   — callback after successful save
  //   onSkip   — callback after dismiss
  function open(options = {}) {
    const { scanId, prefill, onSave, onSkip } = options;
    const modal = ensureShell();

    // Honor today's skip — but only when auto-opening after scan, not
    // when user explicitly hits Quick Check-in.
    const skippedAt = sGet('dermAI_lifestyle_skipped');
    if (options.respectSkip && skippedAt === todayKey()) return;

    // Prefer existing today's entry > caller-supplied prefill > yesterday's entry
    const diary = sGet('dermAI_diary') || {};
    const today = todayKey();
    const yesterday = diary[yesterdayKey()];
    const initial = diary[today] || prefill || null;

    modal.querySelector('#lifestyle-body').innerHTML = renderBody(initial);
    wireBody(modal);

    // "Same as yesterday" button — disabled if no yesterday entry
    const yBtn = modal.querySelector('#lifestyle-yesterday-btn');
    if (!yesterday) {
      yBtn.disabled = true;
      yBtn.textContent = 'no yesterday data';
    } else {
      yBtn.disabled = false;
      yBtn.textContent = 'same as yesterday lol';
      yBtn.onclick = () => {
        modal.querySelector('#lifestyle-body').innerHTML = renderBody(yesterday);
        wireBody(modal);
      };
    }

    modal.querySelector('#lifestyle-skip-btn').onclick = () => {
      sSet('dermAI_lifestyle_skipped', today);
      close(modal);
      if (typeof onSkip === 'function') onSkip();
    };

    modal.querySelector('#lifestyle-save-btn').onclick = async () => {
      const saveBtn = modal.querySelector('#lifestyle-save-btn');
      saveBtn.disabled = true;
      const original = saveBtn.textContent;
      saveBtn.textContent = 'saving…';

      const entry = readForm(modal);
      const wellness = computeWellness(entry);
      if (wellness != null) entry.wellness = wellness;

      // Persist to localStorage immediately so heatmaps update without a
      // round-trip. Merge with existing today-row in case multiple saves.
      const next = { ...(diary[today] || {}), ...entry };
      diary[today] = next;
      sSet('dermAI_diary', diary);

      // Build server payload — use the schema column names.
      const body = { log_date: today };
      if (next.water  != null)    body.water_liters   = next.water;
      if (next.sleep  != null)    body.sleep_hours    = next.sleep;
      if (next.stress != null)    body.stress_1_5     = next.stress;
      if (next.sun    != null)    body.sun_minutes    = next.sun;
      if (next.alcohol != null)   body.alcohol_drinks = next.alcohol;
      if (Array.isArray(next.symptoms)) body.symptoms = next.symptoms;
      if (next.wellness != null)  body.wellness_score = next.wellness;
      if (scanId != null)         body.scan_id        = scanId;

      try {
        if (window.Storage && Storage.server) {
          await Storage.server.post('/api/diary', body);
        }
      } catch (e) { /* fail-silent — local cache is the immediate truth */ }

      // Clear today's skip flag — they DID engage today.
      if (sGet('dermAI_lifestyle_skipped') === today) localStorage.removeItem('dermAI_lifestyle_skipped');

      saveBtn.disabled = false;
      saveBtn.textContent = original;
      close(modal);
      if (typeof onSave === 'function') onSave(next);
    };

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  // Expose computeWellness for tests + overview-trends.js (which renders
  // historical entries that may not have a stored wellness_score).
  return { open, computeWellness, SYMPTOMS };
})();
