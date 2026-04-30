document.addEventListener('DOMContentLoaded', () => {
  // ── Elements ──────────────────────────────────────────────────────────────
  const dropZone      = document.getElementById('drop-zone');
  const multiFileInput = document.getElementById('multi-file-input');
  const slotFileInput = document.getElementById('slot-file-input');
  const cameraBtn     = document.getElementById('camera-btn');

  const cameraContainer = document.getElementById('camera-container');
  const cameraFeed      = document.getElementById('camera-feed');
  const captureBtn      = document.getElementById('capture-btn');
  const closeCameraBtn  = document.getElementById('close-camera-btn');
  const stepCounter     = document.getElementById('step-counter');
  const stepText        = document.getElementById('step-text');
  const faceGuide       = document.getElementById('face-guide');
  const ovalLabel       = document.getElementById('oval-label');

  const previewContainer = document.getElementById('preview-container');
  const thumbnailsGrid   = document.getElementById('thumbnails-grid');
  const analyzeBtn       = document.getElementById('analyze-btn');
  const retakeBtn        = document.getElementById('retake-btn');

  const uploadSection  = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const startOverBtn   = document.getElementById('start-over-btn');
  const uploadSlotsEl  = document.getElementById('upload-slots');

  const STEPS = [
    { label: 'Photo 1 of 3', text: 'Look straight at the camera', flip: false },
    { label: 'Photo 2 of 3', text: 'Slowly turn your head LEFT',  flip: true  },
    { label: 'Photo 3 of 3', text: 'Now turn your head RIGHT',    flip: false },
  ];

  const SLOT_LABELS = ['Front', 'Left', 'Right'];
  const SLOT_HINTS  = ['Facing camera', 'Head turned left', 'Head turned right'];

  let stream         = null;
  let capturedFiles    = [null, null, null]; // fixed-length — null = empty slot
  let capturedDataURLs = [null, null, null];
  let currentStep    = 0;
  let activeSlotIdx  = null; // which slot slot-file-input is targeting

  // ── Pre-scan Drive readiness gate (B1) ────────────────────────────
  // Per user instruction: "always store the photo to gdrive ... prep gdrive
  // before". For logged-in users, ensure Drive scope is granted AND the
  // scans folder is accessible BEFORE we let them scan, so post-scan backup
  // never fails mid-upload (which loses the in-memory photos to OAuth
  // redirects). Anonymous users scan with localStorage only.
  async function ensureDriveReady() {
    if (typeof Storage === 'undefined' || typeof Drive === 'undefined') return;
    const loggedIn = await Storage.isLoggedIn();
    if (!loggedIn) return; // anon users skip the gate

    if (localStorage.getItem('dermAI_drive_declined') === 'true') {
      // User opted out earlier. Allow scan but surface a soft warning so
      // they remember backup is off and can re-enable from Connections.
      showDriveOptOutNotice();
      return;
    }

    if (!Drive.hasScope()) {
      blockScanForDriveGrant('Connect Google Drive so we can save your scan photos.');
      return;
    }

    // Scope is set per localStorage flag — but the provider_token may have
    // expired (~1h). Probe with ensureScansFolder; if it 401s, force a
    // reconnect before allowing the scan.
    try {
      await Drive.ensureScansFolder();
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('provider_token')) {
        blockScanForDriveGrant('Drive permission expired. Reconnect to keep auto-saving your scans.');
      }
      // Other errors (network, quota): let the scan proceed; backup will
      // surface the error after upload succeeds.
    }
  }

  function blockScanForDriveGrant(message) {
    // Disable the analyze button + camera + all slot interactions, swap in
    // a single Connect-Drive panel above the upload box.
    const btn = document.getElementById('analyze-btn');
    if (btn) btn.disabled = true;
    if (cameraBtn) cameraBtn.disabled = true;
    document.querySelectorAll('.upload-slot').forEach(s => s.style.pointerEvents = 'none');

    if (document.getElementById('drive-gate')) return; // don't double-render
    const gate = document.createElement('div');
    gate.id = 'drive-gate';
    gate.className = 'glass-panel';
    gate.style.cssText = 'margin-bottom:1.25rem; padding:1.5rem; background:rgba(245,88,142,0.06); border:1px solid rgba(245,88,142,0.25); display:flex; gap:1rem; align-items:center; flex-wrap:wrap;';
    gate.innerHTML = `
      <div style="flex:1; min-width:240px;">
        <div style="font-weight:700; color:var(--neutral-900); margin-bottom:0.25rem;">${message}</div>
        <div style="font-size:0.78rem; color:var(--neutral-600);">Your scan photos will save to <code>DermAI Photos/Scans/</code> in your own Drive. We can only see files we created — never your other files.</div>
      </div>
      <button class="btn btn-primary" id="drive-gate-connect">Connect Drive</button>
      <button class="link-btn link-btn--muted" id="drive-gate-skip">Skip — local only</button>
    `;
    if (dropZone && dropZone.parentNode) dropZone.parentNode.insertBefore(gate, dropZone);
    document.getElementById('drive-gate-connect').addEventListener('click', () => {
      Drive.requestDriveScope(); // redirects to OAuth
    });
    document.getElementById('drive-gate-skip').addEventListener('click', () => {
      localStorage.setItem('dermAI_drive_declined', 'true');
      gate.remove();
      if (btn) btn.disabled = false;
      if (cameraBtn) cameraBtn.disabled = false;
      document.querySelectorAll('.upload-slot').forEach(s => s.style.pointerEvents = '');
      showDriveOptOutNotice();
    });
  }

  function showDriveOptOutNotice() {
    if (document.getElementById('drive-optout-notice')) return;
    const notice = document.createElement('div');
    notice.id = 'drive-optout-notice';
    notice.style.cssText = 'margin-bottom:1rem; padding:0.75rem 1rem; background:rgba(0,0,0,0.04); border-radius:var(--radius-md,12px); font-size:0.78rem; color:var(--neutral-600);';
    notice.innerHTML = 'Drive backup is off. Scan photos will only live on this device. <a href="/dashboard.html#connections" class="link-btn">Re-enable in Connections</a>';
    if (dropZone && dropZone.parentNode) dropZone.parentNode.insertBefore(notice, dropZone);
  }

  // Fire the gate check on load. Don't await — let the page render first.
  ensureDriveReady();

  // ── Inline error for upload/camera failures ───────────────────────────────
  function showUploadError(msg) {
    const existing = document.getElementById('upload-error');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'upload-error';
    div.style.cssText = 'margin-top:1rem; padding:0.875rem 1rem; background:rgba(245,88,142,0.08); border:1px solid rgba(245,88,142,0.25); color:var(--primary-700); font-size:0.875rem; text-align:center;';
    div.textContent = msg;
    dropZone.after(div);
    setTimeout(() => div.remove(), 6000);
  }

  // ── Slot icons (SVG) ──────────────────────────────────────────────────────
  function slotIcon(i) {
    const base = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>`;
    const left = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:scaleX(-1)"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><path d="M16 8 19 6"/></svg>`;
    const right = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><path d="M8 8 5 6"/></svg>`;
    return [base, left, right][i];
  }

  function slotPlaceholderHTML(i) {
    return `<div class="slot-placeholder">
      ${slotIcon(i)}
      <span class="slot-label">${SLOT_LABELS[i]}</span>
      <span class="slot-hint">${SLOT_HINTS[i]}</span>
    </div>`;
  }

  // ── Slot rendering helpers ─────────────────────────────────────────────────
  function renderSlotFilled(i, dataURL) {
    const slot = document.getElementById(`slot-${i}`);
    if (!slot) return;
    slot.classList.add('filled');
    slot.innerHTML = `
      <img class="slot-thumb" src="${dataURL}" alt="${SLOT_LABELS[i]} photo" />
      <button class="slot-clear-btn" data-clear="${i}" aria-label="Remove ${SLOT_LABELS[i]} photo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
  }

  function renderSlotEmpty(i) {
    const slot = document.getElementById(`slot-${i}`);
    if (!slot) return;
    slot.classList.remove('filled', 'drag-over');
    slot.innerHTML = slotPlaceholderHTML(i);
  }

  function clearSlot(i) {
    capturedFiles[i]    = null;
    capturedDataURLs[i] = null;
    renderSlotEmpty(i);
    updateAnalyzeReadiness();
  }

  function updateAnalyzeReadiness() {
    // Only applicable for file-path (preview-container analyze btn)
    // Nothing to do here for the slot path — auto-advance handles it
  }

  // ── Event delegation on upload-slots ──────────────────────────────────────
  if (uploadSlotsEl) {
    uploadSlotsEl.addEventListener('click', e => {
      const clearBtn = e.target.closest('[data-clear]');
      if (clearBtn) {
        clearSlot(parseInt(clearBtn.dataset.clear));
        return;
      }
      const slot = e.target.closest('.upload-slot:not(.filled)');
      if (slot) {
        activeSlotIdx = parseInt(slot.dataset.slot);
        slotFileInput.click();
      }
    });

    // Keyboard accessibility for slots
    uploadSlotsEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const slot = e.target.closest('.upload-slot:not(.filled)');
        if (slot) {
          e.preventDefault();
          activeSlotIdx = parseInt(slot.dataset.slot);
          slotFileInput.click();
        }
      }
    });

    // Per-slot drag-drop
    uploadSlotsEl.addEventListener('dragover', e => {
      e.preventDefault();
      const slot = e.target.closest('.upload-slot');
      if (slot) slot.classList.add('drag-over');
    });

    uploadSlotsEl.addEventListener('dragleave', e => {
      const slot = e.target.closest('.upload-slot');
      if (slot) slot.classList.remove('drag-over');
    });

    uploadSlotsEl.addEventListener('drop', e => {
      e.preventDefault();
      const slot = e.target.closest('.upload-slot');
      if (!slot) return;
      slot.classList.remove('drag-over');
      const i = parseInt(slot.dataset.slot);
      if (e.dataTransfer.files[0]) fillSlot(i, e.dataTransfer.files[0]);
    });
  }

  // ── Drop-zone background drag-drop (drop on the whole zone, fills next empty) ──
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-active');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-active');
      const files = [...e.dataTransfer.files]
        .filter(f => f.type.startsWith('image/'))
        .slice(0, 3);
      files.forEach((file, idx) => fillSlot(idx, file));
    });
  }

  // ── Single-slot file input ─────────────────────────────────────────────────
  if (slotFileInput) {
    slotFileInput.addEventListener('change', e => {
      if (e.target.files[0] && activeSlotIdx !== null) {
        fillSlot(activeSlotIdx, e.target.files[0]);
      }
      slotFileInput.value = '';
    });
  }

  // ── Multi-file input (Choose 3 Photos button) ─────────────────────────────
  if (multiFileInput) {
    multiFileInput.addEventListener('change', e => {
      const files = [...e.target.files].slice(0, 3);
      files.forEach((file, idx) => fillSlot(idx, file));
      multiFileInput.value = '';
    });
  }

  // ── Fill a slot with an image file ────────────────────────────────────────
  function fillSlot(i, file) {
    if (!file.type.startsWith('image/')) {
      showUploadError('Please select an image file (JPG, PNG, or HEIC).');
      return;
    }
    resizeImage(file, (blob, dataURL) => {
      capturedFiles[i]    = new File([blob], file.name || `photo-${i + 1}.jpg`, { type: 'image/jpeg' });
      capturedDataURLs[i] = dataURL;
      renderSlotFilled(i, dataURL);

      // Auto-advance to preview when all 3 slots are filled
      if (capturedFiles.every(f => f !== null)) {
        showPreview();
      }
    });
  }

  // ── Camera handlers ────────────────────────────────────────────────────────
  if (cameraBtn) {
    cameraBtn.addEventListener('click', async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraFeed.srcObject = stream;
        resetCameraState();
        dropZone.classList.add('hidden');
        cameraContainer.classList.remove('hidden');
      } catch (err) {
        showUploadError('Camera access denied. Allow camera permissions in your browser settings, or upload photos instead.');
        console.error(err);
      }
    });
  }

  if (closeCameraBtn) {
    closeCameraBtn.addEventListener('click', () => {
      stopCamera();
      resetCapture();
      dropZone.classList.remove('hidden');
    });
  }

  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      const MAX = 1024;
      let w = cameraFeed.videoWidth;
      let h = cameraFeed.videoHeight;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(cameraFeed, 0, 0, w, h);

      canvas.toBlob(blob => {
        const stepNum = currentStep + 1;
        const file = new File([blob], `capture-${stepNum}.jpg`, { type: 'image/jpeg' });
        capturedFiles[currentStep]    = file; // index assignment, not push
        capturedDataURLs[currentStep] = canvas.toDataURL('image/jpeg', 0.82);

        const dot = document.getElementById(`dot-${stepNum}`);
        if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }

        currentStep++;

        if (currentStep < STEPS.length) {
          updateCameraStep();
        } else {
          stopCamera();
          showPreview();
        }
      }, 'image/jpeg', 0.9);
    });
  }

  function resetCameraState() {
    currentStep      = 0;
    capturedFiles    = [null, null, null];
    capturedDataURLs = [null, null, null];
    STEPS.forEach((_, i) => {
      const dot = document.getElementById(`dot-${i + 1}`);
      if (dot) { dot.className = 'step-dot' + (i === 0 ? ' active' : ''); }
    });
    updateCameraStep();
  }

  function updateCameraStep() {
    const step = STEPS[currentStep];
    stepCounter.textContent = step.label;
    stepText.textContent    = step.text;
    faceGuide.style.transform = step.flip ? 'scaleX(-1)' : '';
    ovalLabel.style.transform  = step.flip ? 'scaleX(-1)' : '';
    const dot = document.getElementById(`dot-${currentStep + 1}`);
    if (dot) dot.classList.add('active');
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (cameraContainer) cameraContainer.classList.add('hidden');
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  function showPreview() {
    if (dropZone)      dropZone.classList.add('hidden');
    if (cameraContainer) cameraContainer.classList.add('hidden');
    previewContainer.classList.remove('hidden');

    thumbnailsGrid.innerHTML = '';
    capturedDataURLs.forEach((url, i) => {
      if (!url) return;
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src       = url;
      img.alt       = `${SLOT_LABELS[i]} photo`;
      thumbnailsGrid.appendChild(img);
    });

    const filled = capturedFiles.filter(f => f !== null).length;
    analyzeBtn.textContent = filled > 1 ? `Analyze ${filled} Photos` : 'Analyze This Photo';
  }

  function resetCapture() {
    capturedFiles    = [null, null, null];
    capturedDataURLs = [null, null, null];
    currentStep      = 0;
    [0, 1, 2].forEach(i => renderSlotEmpty(i));
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      resetCapture();
      previewContainer.classList.add('hidden');
      dropZone.classList.remove('hidden');
    });
  }

  if (startOverBtn) {
    startOverBtn.addEventListener('click', () => {
      resultsSection.classList.add('hidden');
      uploadSection.classList.remove('hidden');
      resetCapture();
      dropZone.classList.remove('hidden');
    });
  }

  // ── Submit for Analysis ────────────────────────────────────────────────────
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async function handleUpload() {
      const validFiles = capturedFiles.filter(f => f !== null);
      if (!validFiles.length) return;

      analyzeBtn.disabled = true;
      analyzeBtn.setAttribute('aria-busy', 'true');
      loadingSection.classList.remove('hidden');
      previewContainer.classList.add('hidden');
      uploadSection.classList.add('hidden');

      // Rotate loading messages
      const msgs = ['Detecting concerns...', 'Consulting database...', 'Generating routine...'];
      let msgIdx = 0;
      const msgEl = document.getElementById('loading-msg');
      const rotateInterval = msgEl ? setInterval(() => {
        msgIdx = (msgIdx + 1) % msgs.length;
        msgEl.textContent = msgs[msgIdx];
      }, 2200) : null;

      const formData = new FormData();
      validFiles.forEach(f => formData.append('images', f));

      try {
        const response = await fetch('/api/analyze', { method: 'POST', body: formData });

        let errData;
        if (!response.ok) {
          try { errData = await response.json(); } catch (_) { errData = {}; }
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (rotateInterval) clearInterval(rotateInterval);
        data.savedAt = Date.now();
        localStorage.setItem('dermAI_analysis', JSON.stringify(data));

        const saveOpt = document.getElementById('save-photo-opt-in');
        if (saveOpt && saveOpt.checked && capturedFiles[0] && typeof PhotoDB !== 'undefined') {
          PhotoDB.save(data.savedAt, capturedFiles[0], data.overallHealth, data.skinType)
            .catch(err => console.warn('[PhotoDB] save failed:', err));
        }

        renderResults(data);
      } catch (error) {
        if (rotateInterval) clearInterval(rotateInterval);
        console.error('Analysis Failed:', error);
        const msg = error.message || '';

        let userMsg;
        if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
          userMsg = 'AI rate limit reached. Please wait a moment and try again.';
        } else if (msg.includes('No image') || msg.includes('HTTP 400')) {
          userMsg = 'Image not received — please try again.';
        } else if (msg.includes('OPENROUTER_API_KEY') || msg.includes('not configured')) {
          userMsg = 'Analysis service unavailable. Please try again later.';
        } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_CONNECTION')) {
          userMsg = 'Connection failed. Check your internet and try again.';
        } else {
          userMsg = 'Something went wrong. Please try again in a moment.';
        }

        analyzeBtn.disabled = false;
        analyzeBtn.removeAttribute('aria-busy');
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        previewContainer.classList.remove('hidden');

        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'margin-top:1rem; padding:1rem; background:rgba(245,88,142,0.08); border:1px solid rgba(245,88,142,0.25); border-radius:12px; color:var(--primary-700); font-size:0.875rem; text-align:center;';
        errDiv.textContent = userMsg;
        const existing = document.getElementById('analysis-error');
        if (existing) existing.remove();
        errDiv.id = 'analysis-error';
        previewContainer.appendChild(errDiv);
      }
    });
  }

  // ── Image resize helper ────────────────────────────────────────────────────
  function resizeImage(source, callback) {
    const MAX = 1024;
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataURL = canvas.toDataURL('image/jpeg', 0.82);
      canvas.toBlob(blob => callback(blob, dataURL), 'image/jpeg', 0.82);
    };
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  }

  // ── Scan History ──────────────────────────────────────────────────────────
  function saveToHistory(data) {
    const id    = data.savedAt || Date.now();
    const entry = { id, date: new Date(id).toISOString(), analysis: data };
    const raw   = localStorage.getItem('dermAI_history');
    const history = raw ? JSON.parse(raw) : [];
    history.push(entry);
    if (history.length > 20) history.splice(0, history.length - 20);
    localStorage.setItem('dermAI_history', JSON.stringify(history));
    return history;
  }

  function renderHistory(history) {
    const existing = document.getElementById('history-section');
    if (existing) existing.remove();
    if (history.length < 2) return;

    const section = document.createElement('div');
    section.id = 'history-section';
    section.style.cssText = 'margin-top:2rem;';

    const maxScore = 100;
    const barWidth = Math.max(32, Math.floor(320 / history.length));

    const bars = history.map((h, i) => {
      const score     = h.analysis?.overallHealth ?? h.overallHealth;
      const heightPct = (score / maxScore) * 100;
      const isLatest  = i === history.length - 1;
      const label     = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; min-width:${barWidth}px; max-width:60px;">
          <span style="font-size:0.65rem; color:${isLatest ? 'var(--primary-300)' : 'var(--neutral-400)'}; font-weight:${isLatest ? '700' : '400'};">${score}</span>
          <div style="width:100%; height:80px; display:flex; align-items:flex-end;">
            <div style="width:100%; height:${heightPct}%; background:${isLatest ? 'var(--primary-500)' : 'rgba(160,124,255,0.25)'}; border-radius:4px 4px 0 0; transition:height 0.3s;"></div>
          </div>
          <span style="font-size:0.6rem; color:var(--neutral-500); white-space:nowrap;">${label}</span>
        </div>`;
    }).join('');

    const last      = history[history.length - 1];
    const prev      = history[history.length - 2];
    const trend     = (last.analysis?.overallHealth ?? last.overallHealth) - (prev.analysis?.overallHealth ?? prev.overallHealth);
    const trendText = trend > 0 ? `↑ +${trend} from last scan` : trend < 0 ? `↓ ${trend} from last scan` : 'No change from last scan';
    const trendColor = trend > 0 ? 'var(--primary-500)' : trend < 0 ? 'var(--error)' : 'var(--neutral-600)';

    section.innerHTML = `
      <div class="glass-panel" style="padding:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h3 style="font-size:1rem; color:var(--neutral-100);">Skin Health History</h3>
          <span style="font-size:0.8rem; color:${trendColor}; font-weight:600;">${trendText}</span>
        </div>
        <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:0.5rem;">
          ${bars}
        </div>
        <p style="font-size:0.7rem; color:var(--neutral-500); margin-top:0.75rem; text-align:center;">${history.length} scan${history.length !== 1 ? 's' : ''} recorded on this device</p>
      </div>`;

    resultsSection.appendChild(section);
  }

  // ── Ingredient lookup data — fetched once, cached for the page ────────────
  let _concernsMap = null;     // { "Acne": { targetIngredients:[…], rationale:"…" }, … }
  let _ingredientsList = null; // [{ id, name, evidenceTier, … }, …]

  async function loadIngredientData() {
    if (_concernsMap && _ingredientsList) return;
    try {
      const [c, i] = await Promise.all([
        fetch('/api/concerns').then(r => r.ok ? r.json() : null),
        fetch('/api/ingredients').then(r => r.ok ? r.json() : null),
      ]);
      if (c) _concernsMap = c;
      if (i) _ingredientsList = i;
    } catch (_) { /* offline / first-render best-effort; chips just won't show */ }
  }

  function prettyIngredient(id) {
    // First try the canonical name from ingredients.json
    const found = _ingredientsList?.find(x => x.id === id);
    if (found?.name) return found.name;
    // Fallback: salicylic_acid → salicylic acid
    return String(id).replace(/_/g, ' ');
  }

  function tierLabel(tier) {
    if (tier === 1) return 'Tier 1 (RCT)';
    if (tier === 2) return 'Tier 2';
    if (tier === 3) return 'Tier 3';
    return tier ? `Tier ${tier}` : '';
  }

  // Render chips on each concern card + the deduped shortlist below.
  // Called after concern cards are in the DOM and ingredient JSON is loaded.
  function renderIngredientLayer(concerns) {
    if (!_concernsMap) return; // fetch failed; degrade silently

    // Per-concern chips
    document.querySelectorAll('.concern-card').forEach(card => {
      const name = card.dataset.concernName;
      const slot = card.querySelector('[data-ingredients-slot]');
      if (!slot) return;
      const ids = _concernsMap[name]?.targetIngredients || [];
      if (!ids.length) { slot.remove(); return; }
      const chips = ids.map(id => `<span class="ing-chip">${prettyIngredient(id)}</span>`).join('');
      slot.innerHTML = `<span class="ing-prefix">USE:</span> ${chips}`;
    });

    // Deduped shortlist: ingredient → concerns it addresses, weighted by concern severity
    const tally = new Map(); // id → { weight, concerns:Set }
    concerns.forEach(c => {
      const ids = _concernsMap[c.name]?.targetIngredients || [];
      ids.forEach(id => {
        const entry = tally.get(id) || { weight: 0, concerns: new Set() };
        entry.weight += (c.severity || 0);
        entry.concerns.add(c.name);
        tally.set(id, entry);
      });
    });

    const shortlistEl = document.getElementById('ingredient-shortlist');
    if (!shortlistEl) return;
    if (!tally.size) {
      shortlistEl.classList.add('hidden');
      return;
    }

    const ranked = [...tally.entries()]
      .sort((a, b) => b[1].weight - a[1].weight);

    const rows = ranked.map(([id, info]) => {
      const ing = _ingredientsList?.find(x => x.id === id);
      const tier = tierLabel(ing?.evidenceTier);
      const targets = [...info.concerns].join(' · ');
      return `
        <li class="shortlist-row">
          <span class="shortlist-name">${prettyIngredient(id)}</span>
          ${tier ? `<span class="shortlist-tier">${tier}</span>` : ''}
          <span class="shortlist-targets">${targets}</span>
        </li>
      `;
    }).join('');

    shortlistEl.innerHTML = `
      <div class="shortlist-header">
        <h3 class="shortlist-title">Your ingredient shortlist</h3>
        <p class="shortlist-sub">${ranked.length} ingredients ranked by impact across your concerns</p>
      </div>
      <ul class="shortlist-list">${rows}</ul>
      <a href="/dashboard.html#routine" class="btn btn-outline shortlist-cta">View routine using these →</a>
    `;
    shortlistEl.classList.remove('hidden');
  }

  // ── Render Results ────────────────────────────────────────────────────────
  function renderResults(data) {
    loadingSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    document.getElementById('overall-health').textContent   = data.overallHealth;
    document.getElementById('skin-type-result').textContent = data.skinType;

    const concernsList = document.getElementById('concerns-list');
    concernsList.innerHTML = '';

    // Kick off ingredient data load early; chips + shortlist render once it resolves
    const ingredientsReady = loadIngredientData();

    data.concerns.forEach(concern => {
      let severityClass = 'severity-low';
      let severityText  = 'Low';
      if (concern.severity > 60) {
        severityClass = 'severity-high';
        severityText  = 'High';
      } else if (concern.severity > 30) {
        severityClass = 'severity-medium';
        severityText  = 'Medium';
      }

      const card = document.createElement('div');
      card.className = 'concern-card glass-panel';
      card.dataset.concernName = concern.name;
      card.innerHTML = `
        <div class="concern-header">
          <span class="concern-name">${concern.name}</span>
          <span class="severity-badge ${severityClass}">${severityText} (${concern.severity}/100)</span>
        </div>
        <p class="concern-description">${concern.description}</p>
        <div class="concern-ingredients" data-ingredients-slot></div>
      `;
      concernsList.appendChild(card);
    });

    ingredientsReady.then(() => renderIngredientLayer(data.concerns));

    // Stamp savedAt so the routine page can tell "just scanned" from "stale
    // cache" when deciding whether to trust localStorage over an empty server.
    if (!data.savedAt) data.savedAt = Date.now();
    localStorage.setItem('dermAI_analysis', JSON.stringify(data));
    const history = saveToHistory(data);

    // Capture scan ID for Drive backup (resolves asynchronously). The POST
    // is fire-and-forget for the UI — if it fails we keep the localStorage
    // copy so the user's just-finished scan still works on the routine page,
    // and routine.init() will trust fresh-stamp local data when the server
    // returns nothing.
    const savedScanInfoPromise = Storage.server.post('/api/scans', { result_json: data })
      .then(r => ({
        id: r?.scan?.id ?? null,
        created_at: r?.scan?.created_at ?? null,
        day_index: typeof r?.day_index === 'number' ? r.day_index : 0,
      }))
      .catch(() => ({ id: null, created_at: null, day_index: 0 }));

    renderHistory(history);

    // Soft gate: sign-in CTA for anonymous users
    Storage.isLoggedIn().then(async loggedIn => {
      if (!loggedIn) {
        const saveGate = document.createElement('div');
        saveGate.className = 'save-gate';
        saveGate.style.cssText = 'margin-top:1.5rem; padding:1.25rem 1.5rem; border:1px solid var(--border,#e8e4dc); border-radius:var(--radius-lg,24px); box-shadow:var(--shadow-md); background:var(--bg-card,#fff); display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;';
        saveGate.innerHTML = `
          <p class="save-gate__msg" style="margin:0; font-family:var(--font-primary,system-ui,sans-serif); font-size:0.875rem; font-weight:600; color:var(--text-body,#3a3630);">Sign in to save this analysis across devices</p>
          <button class="btn btn-primary" id="save-gate-btn" style="white-space:nowrap;">SIGN IN WITH GOOGLE</button>
        `;
        if (!resultsSection.querySelector('.save-gate')) resultsSection.appendChild(saveGate);
        saveGate.querySelector('#save-gate-btn').addEventListener('click', () => {
          if (window.Auth) window.Auth.signInWithGoogle();
        });
        return;
      }

      if (typeof Drive === 'undefined') return;

      // Auto Drive backup status pill (P2) — replaces the old opt-in toggle.
      // If scope is already granted, kick off the backup automatically.
      // If not, show an "Enable backup" affordance so the user can opt in
      // without losing the in-memory photos to an OAuth redirect.
      const ANGLE_LABELS = ['front', 'left', 'right'];
      const driveSection = document.createElement('div');
      driveSection.className = 'drive-backup';
      driveSection.innerHTML = `
        <div class="drive-backup__row">
          <div>
            <div class="drive-backup__label" id="drive-label">SAVING TO GOOGLE DRIVE…</div>
            <div class="drive-backup__hint" id="drive-hint">Uploading your scan photos automatically</div>
          </div>
          <span class="drive-backup__status" id="drive-status" aria-live="polite">⏳</span>
        </div>
        <div class="drive-backup__bar" id="drive-bar" style="display:none">
          <div class="drive-backup__fill" id="drive-fill"></div>
        </div>
      `;
      resultsSection.appendChild(driveSection);

      const label  = document.getElementById('drive-label');
      const hint   = document.getElementById('drive-hint');
      const status = document.getElementById('drive-status');
      const bar    = document.getElementById('drive-bar');
      const fill   = document.getElementById('drive-fill');

      async function runDriveBackup() {
        bar.style.display = 'block';
        status.textContent = '⏳';
        try {
          // Wait for the scan POST so we know which day this is (day_index
          // computed server-side from the user's earliest scan). We need the
          // day folder name BEFORE uploading photos so they land in the right
          // place — slight extra latency but it's the right sequencing.
          const scanInfo = await savedScanInfoPromise;
          const dayIndex = scanInfo?.day_index ?? 0;
          const dateYYYYMMDD = (scanInfo?.created_at
            ? new Date(scanInfo.created_at)
            : new Date(data.savedAt || Date.now())
          ).toISOString().slice(0, 10);

          const dayFolderId = await Drive.ensureDayFolder(dayIndex, dateYYYYMMDD);
          const filesToUp   = capturedFiles.filter(Boolean);
          const urls        = [];

          for (let i = 0; i < filesToUp.length; i++) {
            // Inside the day folder we can use simple short filenames —
            // the parent folder already encodes the date + day.
            const filename = `${ANGLE_LABELS[i]}.jpg`;
            hint.textContent = `Uploading ${filesToUp.length} photos to Day ${dayIndex} folder… (${i + 1}/${filesToUp.length})`;
            fill.style.width = `${Math.round((i / filesToUp.length) * 100)}%`;
            const result = await Drive.uploadPhoto(filesToUp[i], filename, dayFolderId);
            urls.push(result.webViewLink);
          }
          fill.style.width = '100%';

          // PATCH image_urls on the saved scan row.
          if (scanInfo?.id) {
            fetch(`/api/scans/${scanInfo.id}/images`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await window.Auth.getToken()}`,
              },
              body: JSON.stringify({ image_urls: urls }),
            }).catch(e => console.warn('[Drive] PATCH scans images failed:', e.message));
          }

          const user = await window.Auth.getUser();
          if (user) Drive.migrateFromIndexedDB(user.id).catch(() => {});

          label.textContent  = 'SAVED TO GOOGLE DRIVE ✓';
          status.textContent = '✓';
          const folderLink   = `https://drive.google.com/drive/folders/${encodeURIComponent(dayFolderId)}`;
          const dayName      = dayIndex === 0 ? 'Day 0 (Initial)' : `Day ${dayIndex}`;
          hint.innerHTML     = `${filesToUp.length} photos saved to <strong>${dayName}</strong> · <a href="${folderLink}" target="_blank" rel="noopener">View in Drive →</a>`;
          bar.style.display  = 'none';
        } catch (err) {
          console.error('[Drive] backup failed:', err);
          label.textContent  = 'BACKUP FAILED';
          status.textContent = '⚠';
          // Surface the actual error so we can diagnose. Common cases:
          // - "no provider_token" → Drive scope expired or never granted
          // - "Drive API 401" → token expired, need re-grant
          // - "quota" → Drive is full
          const msg = String(err?.message || err || 'Unknown error');
          let userMsg;
          if (msg.includes('quota')) {
            userMsg = 'Google Drive is full — free up space and reload to retry.';
          } else if (msg.includes('provider_token') || msg.includes('401')) {
            userMsg = 'Drive permission expired. <button id="drive-retry-grant" class="link-btn">Reconnect Drive</button> to retry.';
          } else {
            userMsg = `Couldn't save to Drive: ${msg.slice(0, 80)}`;
          }
          hint.innerHTML     = userMsg;
          bar.style.display  = 'none';
          const retryBtn = document.getElementById('drive-retry-grant');
          if (retryBtn) retryBtn.addEventListener('click', () => Drive.requestDriveScope());
        }
      }

      if (Drive.hasScope()) {
        // Scope already granted — fire automatically.
        runDriveBackup();
      } else if (localStorage.getItem('dermAI_drive_declined') === 'true') {
        // User said no earlier — don't nag. Show a quiet enable affordance.
        label.textContent  = 'DRIVE BACKUP IS OFF';
        status.textContent = '';
        hint.innerHTML     = '<button id="drive-reenable" class="link-btn">Enable backup</button> to save scan photos to your Google Drive';
        document.getElementById('drive-reenable').addEventListener('click', async () => {
          localStorage.removeItem('dermAI_drive_declined');
          hint.textContent = 'Redirecting to Google for permission…';
          await Drive.requestDriveScope(); // page redirects; photos in memory are lost
        });
      } else {
        // First-time user without scope — offer one inline grant button.
        // Granting redirects to OAuth which loses the in-memory photos, so
        // we don't auto-trigger; user opts in explicitly.
        label.textContent  = 'BACK UP PHOTOS TO DRIVE';
        status.textContent = '';
        hint.innerHTML     = '<button id="drive-grant" class="link-btn">Allow Drive access</button> to auto-save every scan. <button id="drive-skip" class="link-btn link-btn--muted">Not now</button>';
        document.getElementById('drive-grant').addEventListener('click', async () => {
          hint.textContent = 'Redirecting to Google for permission…';
          await Drive.requestDriveScope();
        });
        document.getElementById('drive-skip').addEventListener('click', () => {
          localStorage.setItem('dermAI_drive_declined', 'true');
          label.textContent  = 'DRIVE BACKUP IS OFF';
          hint.innerHTML     = '<button id="drive-reenable2" class="link-btn">Enable backup</button> later from any scan';
          document.getElementById('drive-reenable2').addEventListener('click', async () => {
            localStorage.removeItem('dermAI_drive_declined');
            hint.textContent = 'Redirecting to Google for permission…';
            await Drive.requestDriveScope();
          });
        });
      }
    });
  }
});
