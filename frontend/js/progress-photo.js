(() => {
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  function _computeStreak(photos) {
    // photos ordered date desc from server
    if (!photos.length) return 0;
    let streak = 0;
    const d = new Date(TODAY);
    for (const p of photos) {
      const pDate = p.photo_date; // YYYY-MM-DD string
      const expected = d.toISOString().slice(0, 10);
      if (pDate !== expected) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function _streakDots(streak, total = 7) {
    const dots = [];
    for (let i = 0; i < total; i++) {
      const filled = i < Math.min(streak, total);
      dots.push(`<div class="progress-card__dot${filled ? '' : ' progress-card__dot--empty'}"></div>`);
    }
    return dots.join('');
  }

  function _resizeImage(file, callback) {
    const MAX = 1024;
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => callback(new File([blob], file.name, { type: 'image/jpeg' }), canvas.toDataURL('image/jpeg', 0.82)), 'image/jpeg', 0.82);
    };
    img.src = URL.createObjectURL(file);
  }

  async function _uploadAndSave(file, card, streak) {
    const label = card.querySelector('.progress-card__label');
    const sub   = card.querySelector('.progress-card__sub');
    const bar   = card.querySelector('.progress-card__bar');
    const fill  = card.querySelector('.progress-card__fill');

    label.textContent = 'DAILY PROGRESS PHOTO';
    sub.textContent   = 'Saving to Drive…';
    bar.style.display = 'block';
    fill.style.width  = '30%';

    try {
      const folderId = await Drive.ensureProgressFolder();
      fill.style.width = '60%';
      const result = await Drive.uploadPhoto(file, `progress-${TODAY}.jpg`, folderId);
      fill.style.width = '90%';

      const token = await window.Auth.getToken();
      await fetch('/api/progress-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photo_date: TODAY, drive_file_id: result.id, drive_url: result.webViewLink }),
      });

      fill.style.width = '100%';
      setTimeout(() => _renderDone(card, result.thumbnailLink || result.webViewLink, streak + 1), 300);
    } catch (err) {
      console.error('[ProgressPhoto] upload failed:', err.message);
      bar.style.display = 'none';
      label.textContent = 'DAILY PROGRESS PHOTO';
      sub.textContent   = 'Upload failed — try again';
    }
  }

  function _renderAnonymous(card) {
    card.className = 'progress-card progress-card--anonymous';
    card.innerHTML = `
      <div class="progress-card__row">
        <div class="progress-card__icon">📸</div>
        <div>
          <div class="progress-card__label">DAILY PROGRESS PHOTO</div>
          <div class="progress-card__sub">Sign in to start your photo streak</div>
        </div>
      </div>`;
  }

  function _renderReady(card, streak) {
    card.className = 'progress-card';
    card.innerHTML = `
      <div class="progress-card__row">
        <div class="progress-card__icon">📸</div>
        <div style="flex:1; min-width:0;">
          <div class="progress-card__label">DAILY PROGRESS PHOTO</div>
          <div class="progress-card__sub">${TODAY} · no photo yet</div>
          <div class="progress-card__streak">${_streakDots(streak)}</div>
          ${streak > 0 ? `<div class="progress-card__sub" style="margin-top:3px;">${streak}-day streak${streak >= 3 ? ' 🔥' : ''}</div>` : ''}
        </div>
        <button class="btn btn-primary progress-card__snap" id="progress-snap-btn" style="flex-shrink:0;">+ SNAP</button>
      </div>
      <div class="progress-card__bar" style="display:none"><div class="progress-card__fill"></div></div>`;

    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'user'; input.style.display = 'none';
    card.appendChild(input);

    card.querySelector('#progress-snap-btn').addEventListener('click', async () => {
      if (!Drive.hasScope()) {
        card.querySelector('.progress-card__sub').textContent = 'Redirecting to Google for permission…';
        await Drive.requestDriveScope();
        return;
      }
      input.click();
    });

    input.addEventListener('change', e => {
      if (e.target.files[0]) {
        _resizeImage(e.target.files[0], file => _uploadAndSave(file, card, streak));
        input.value = '';
      }
    });
  }

  function _renderDone(card, driveUrl, streak) {
    card.className = 'progress-card';
    const progFolderId = localStorage.getItem('dermai-drive-folder-progress') || '';
    card.innerHTML = `
      <div class="progress-card__row">
        <img class="progress-card__thumb" src="${driveUrl}" alt="Today's progress photo" onerror="this.style.display='none'">
        <div style="flex:1; min-width:0;">
          <div class="progress-card__label">TODAY'S PHOTO SAVED ✓</div>
          <div class="progress-card__sub">${TODAY}</div>
          <div class="progress-card__streak">${_streakDots(streak)}</div>
          ${streak > 0 ? `<div class="progress-card__sub" style="margin-top:3px;">${streak}-day streak${streak >= 3 ? ' 🔥' : ''}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;flex-shrink:0;">
          <button class="btn btn-ghost progress-card__retake" id="progress-retake-btn" style="font-size:0.7rem;padding:4px 8px;">RETAKE</button>
          <a href="https://drive.google.com/drive/folders/${encodeURIComponent(progFolderId)}" target="_blank" rel="noopener" style="font-family:'Space Mono',monospace;font-size:0.65rem;color:#666;">View →</a>
        </div>
      </div>`;

    card.querySelector('#progress-retake-btn').addEventListener('click', async () => {
      const token = await window.Auth.getToken();
      await fetch(`/api/progress-photos/${TODAY}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      // Re-render as ready state, streak decrements by 1 (today's photo removed)
      _renderReady(card, Math.max(0, streak - 1));
    });
  }

  async function init() {
    const mount = document.getElementById('progress-card-mount');
    if (!mount) return;

    const card = document.createElement('div');
    card.className = 'progress-card';
    mount.appendChild(card);

    if (!window.Auth) { _renderAnonymous(card); return; }

    const user = await window.Auth.getUser();
    if (!user) { _renderAnonymous(card); return; }

    // Fetch photo history
    let photos = [];
    try {
      const token = await window.Auth.getToken();
      const r = await fetch('/api/progress-photos', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) ({ photos } = await r.json());
    } catch (_) { /* offline — show ready state */ }

    const todayPhoto = photos.find(p => p.photo_date === TODAY);
    const streak     = _computeStreak(photos);

    if (todayPhoto) {
      _renderDone(card, todayPhoto.drive_url, streak);
    } else {
      _renderReady(card, streak);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
