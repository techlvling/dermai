document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const cameraBtn = document.getElementById('camera-btn');

  const cameraContainer = document.getElementById('camera-container');
  const cameraFeed = document.getElementById('camera-feed');
  const captureBtn = document.getElementById('capture-btn');
  const closeCameraBtn = document.getElementById('close-camera-btn');
  const stepCounter = document.getElementById('step-counter');
  const stepText = document.getElementById('step-text');
  const faceGuide = document.getElementById('face-guide');
  const ovalLabel = document.getElementById('oval-label');

  const previewContainer = document.getElementById('preview-container');
  const thumbnailsGrid = document.getElementById('thumbnails-grid');
  const analyzeBtn = document.getElementById('analyze-btn');
  const retakeBtn = document.getElementById('retake-btn');

  const uploadSection = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const startOverBtn = document.getElementById('start-over-btn');

  const STEPS = [
    { label: 'Photo 1 of 3', text: 'Look straight at the camera', flip: false },
    { label: 'Photo 2 of 3', text: 'Slowly turn your head LEFT',  flip: true  },
    { label: 'Photo 3 of 3', text: 'Now turn your head RIGHT',    flip: false },
  ];

  let stream = null;
  let capturedFiles = [];   // array of File objects (1 from file-picker, or up to 3 from camera)
  let capturedDataURLs = []; // matching array of dataURLs for preview
  let currentStep = 0;      // 0-based index into STEPS (camera flow only)

  // --- Drag & Drop Handlers ---
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  // --- File Input Handler ---
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Resize any image to max 1024px on the longest side, JPEG 0.82 quality
  // Keeps uploads well under Vercel's 4.5 MB body limit
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
    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  }

  function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }
    resizeImage(file, (blob, dataURL) => {
      capturedFiles    = [new File([blob], file.name, { type: 'image/jpeg' })];
      capturedDataURLs = [dataURL];
      showPreview();
    });
  }

  // --- Camera Handlers ---
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

  closeCameraBtn.addEventListener('click', () => {
    stopCamera();
    resetCapture();
    dropZone.classList.remove('hidden');
  });

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

    canvas.toBlob((blob) => {
      const stepNum = currentStep + 1;
      const file = new File([blob], `capture-${stepNum}.jpg`, { type: 'image/jpeg' });
      capturedFiles.push(file);
      capturedDataURLs.push(canvas.toDataURL('image/jpeg', 0.82));

      // Mark dot as done
      const dot = document.getElementById(`dot-${stepNum}`);
      if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }

      currentStep++;

      if (currentStep < STEPS.length) {
        // Advance to next step
        updateCameraStep();
      } else {
        // All 3 captured — show preview
        stopCamera();
        showPreview();
      }
    }, 'image/jpeg', 0.9);
  });

  function resetCameraState() {
    currentStep = 0;
    capturedFiles = [];
    capturedDataURLs = [];
    // Reset dots
    STEPS.forEach((_, i) => {
      const dot = document.getElementById(`dot-${i + 1}`);
      if (dot) { dot.className = 'step-dot' + (i === 0 ? ' active' : ''); }
    });
    updateCameraStep();
  }

  function updateCameraStep() {
    const step = STEPS[currentStep];
    stepCounter.textContent = step.label;
    stepText.textContent = step.text;
    // Flip SVG overlay for left-turn step so dimmed side matches
    faceGuide.style.transform = step.flip ? 'scaleX(-1)' : '';
    ovalLabel.style.transform = step.flip ? 'scaleX(-1)' : '';
    // Activate current dot
    const dot = document.getElementById(`dot-${currentStep + 1}`);
    if (dot) dot.classList.add('active');
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    cameraContainer.classList.add('hidden');
  }

  // --- Preview ---
  function showPreview() {
    dropZone.classList.add('hidden');
    cameraContainer.classList.add('hidden');
    previewContainer.classList.remove('hidden');

    thumbnailsGrid.innerHTML = '';
    capturedDataURLs.forEach((url, i) => {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = url;
      img.alt = `Capture ${i + 1}`;
      thumbnailsGrid.appendChild(img);
    });

    analyzeBtn.textContent = capturedFiles.length > 1
      ? `Analyze ${capturedFiles.length} Photos`
      : 'Analyze This Photo';
  }

  function resetCapture() {
    capturedFiles = [];
    capturedDataURLs = [];
    currentStep = 0;
  }

  retakeBtn.addEventListener('click', () => {
    resetCapture();
    previewContainer.classList.add('hidden');
    dropZone.classList.remove('hidden');
  });

  startOverBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    resetCapture();
    dropZone.classList.remove('hidden');
  });

  // --- Submit for Analysis ---
  analyzeBtn.addEventListener('click', async function handleUpload() {
    if (!capturedFiles.length) return;

    loadingSection.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    uploadSection.classList.add('hidden');

    const formData = new FormData();
    capturedFiles.forEach(f => formData.append('images', f));

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      let errData;
      if (!response.ok) {
        try { errData = await response.json(); } catch (_) { errData = {}; }
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      localStorage.setItem('dermAI_analysis', JSON.stringify(data));
      renderResults(data);
    } catch (error) {
      console.error("Analysis Failed:", error);
      const msg = error.message || '';

      let userMsg;
      if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        userMsg = 'Daily AI quota reached. Please try again tomorrow or enable billing on your Google AI account.';
      } else if (msg.includes('No image') || msg.includes('HTTP 400')) {
        userMsg = 'Image not received — please restart the server and try again.';
      } else if (msg.includes('GEMINI_API_KEY') || msg.includes('not configured')) {
        userMsg = 'API key missing — set GEMINI_API_KEY in backend/.env and restart the server.';
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_CONNECTION')) {
        userMsg = 'Cannot reach the server. Is the backend running? Try: node backend/server.js';
      } else {
        userMsg = `Error: ${msg || 'Unknown error — check the server console for details.'}`;
      }

      loadingSection.classList.add('hidden');
      uploadSection.classList.remove('hidden');
      previewContainer.classList.remove('hidden');

      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'margin-top:1rem; padding:1rem; background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.4); border-radius:8px; color:#f87171; font-size:0.875rem; text-align:center;';
      errDiv.textContent = userMsg;
      const existing = document.getElementById('analysis-error');
      if (existing) existing.remove();
      errDiv.id = 'analysis-error';
      previewContainer.appendChild(errDiv);
    }
  });

  // --- Scan History ---
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
      const isLatest = i === history.length - 1;
      const label = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; min-width:${barWidth}px; max-width:60px;">
          <span style="font-size:0.65rem; color:${isLatest ? 'var(--primary-300)' : 'var(--neutral-400)'}; font-weight:${isLatest ? '700' : '400'};">${h.overallHealth}</span>
          <div style="width:100%; height:80px; display:flex; align-items:flex-end;">
            <div style="width:100%; height:${heightPct}%; background:${isLatest ? 'var(--primary-500)' : 'rgba(99,102,241,0.3)'}; border-radius:4px 4px 0 0; transition:height 0.3s;"></div>
          </div>
          <span style="font-size:0.6rem; color:var(--neutral-500); white-space:nowrap;">${label}</span>
        </div>`;
    }).join('');

    const trend = history[history.length - 1].overallHealth - history[history.length - 2].overallHealth;
    const trendText = trend > 0 ? `↑ +${trend} from last scan` : trend < 0 ? `↓ ${trend} from last scan` : 'No change from last scan';
    const trendColor = trend > 0 ? 'var(--primary-300)' : trend < 0 ? '#f87171' : 'var(--neutral-400)';

    section.innerHTML = `
      <div class="glass-panel" style="padding:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h3 style="font-size:1rem; color:var(--neutral-100);">📈 Skin Health History</h3>
          <span style="font-size:0.8rem; color:${trendColor}; font-weight:600;">${trendText}</span>
        </div>
        <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:0.5rem;">
          ${bars}
        </div>
        <p style="font-size:0.7rem; color:var(--neutral-500); margin-top:0.75rem; text-align:center;">${history.length} scan${history.length !== 1 ? 's' : ''} recorded on this device</p>
      </div>`;

    resultsSection.appendChild(section);
  }

  // --- Render Results ---
  function renderResults(data) {
    loadingSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    document.getElementById('overall-health').textContent = data.overallHealth;
    document.getElementById('skin-type-result').textContent = data.skinType;

    const concernsList = document.getElementById('concerns-list');
    concernsList.innerHTML = '';

    data.concerns.forEach(concern => {
      let severityClass = 'severity-low';
      let severityText = 'Low';
      if (concern.severity > 60) {
        severityClass = 'severity-high';
        severityText = 'High';
      } else if (concern.severity > 30) {
        severityClass = 'severity-medium';
        severityText = 'Medium';
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
