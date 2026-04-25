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
      alert('Please select a valid image file.');
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
        alert('Unable to access camera. Please check permissions.');
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
          userMsg = 'API key missing — set OPENROUTER_API_KEY in backend/.env and restart.';
        } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_CONNECTION')) {
          userMsg = 'Cannot reach the server. Is the backend running?';
        } else {
          userMsg = `Error: ${msg || 'Unknown error — check the server console.'}`;
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
    const entry = {
      date: new Date().toISOString(),
      overallHealth: data.overallHealth,
      skinType: data.skinType,
      concerns: data.concerns.map(c => ({ name: c.name, severity: c.severity }))
    };
    const raw = localStorage.getItem('dermAI_history');
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
      const heightPct = (h.overallHealth / maxScore) * 100;
      const isLatest  = i === history.length - 1;
      const label     = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; min-width:${barWidth}px; max-width:60px;">
          <span style="font-size:0.65rem; color:${isLatest ? 'var(--primary-300)' : 'var(--neutral-400)'}; font-weight:${isLatest ? '700' : '400'};">${h.overallHealth}</span>
          <div style="width:100%; height:80px; display:flex; align-items:flex-end;">
            <div style="width:100%; height:${heightPct}%; background:${isLatest ? 'var(--primary-500)' : 'rgba(160,124,255,0.25)'}; border-radius:4px 4px 0 0; transition:height 0.3s;"></div>
          </div>
          <span style="font-size:0.6rem; color:var(--neutral-500); white-space:nowrap;">${label}</span>
        </div>`;
    }).join('');

    const trend     = history[history.length - 1].overallHealth - history[history.length - 2].overallHealth;
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

  // ── Render Results ────────────────────────────────────────────────────────
  function renderResults(data) {
    loadingSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    document.getElementById('overall-health').textContent   = data.overallHealth;
    document.getElementById('skin-type-result').textContent = data.skinType;

    const concernsList = document.getElementById('concerns-list');
    concernsList.innerHTML = '';

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
      card.innerHTML = `
        <div class="concern-header">
          <span class="concern-name">${concern.name}</span>
          <span class="severity-badge ${severityClass}">${severityText} (${concern.severity}/100)</span>
        </div>
        <p class="concern-description">${concern.description}</p>
      `;
      concernsList.appendChild(card);
    });

    localStorage.setItem('dermAI_analysis', JSON.stringify(data));
    const history = saveToHistory(data);
    renderHistory(history);
  }
});
