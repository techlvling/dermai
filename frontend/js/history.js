window.History = (function () {
  let historyData  = [];
  const photosByDay = {};
  let _mounted     = false;
  let _compareMounted = false;

  // Drive webViewLink → file ID. Examples:
  //   https://drive.google.com/file/d/1AbCdEfGh/view?usp=drivesdk
  //   https://drive.google.com/uc?id=1AbCdEfGh
  function driveFileIdFromUrl(url) {
    if (typeof url !== 'string') return null;
    const m1 = url.match(/\/file\/d\/([^\/?]+)/);
    if (m1) return m1[1];
    const m2 = url.match(/[?&]id=([^&]+)/);
    if (m2) return m2[1];
    return null;
  }

  // Per-fileId memo so we only fetch each Drive image once per session.
  const _driveBlobUrls = new Map();
  async function driveBlobUrl(fileId) {
    if (!fileId) return null;
    if (_driveBlobUrls.has(fileId)) return _driveBlobUrls.get(fileId);
    if (typeof Drive === 'undefined' || !Drive.hasScope()) return null;
    try {
      const token = await window.Auth.getProviderToken();
      if (!token) return null;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      _driveBlobUrls.set(fileId, url);
      return url;
    } catch (_) { return null; }
  }

  async function _init() {
    // Server-first when logged in. Otherwise the same scan would show up
    // twice (local entry has id=Date.now(); server entry has id=bigint;
    // dedup-by-id never matches and both get rendered).
    const loggedIn = await Storage.isLoggedIn();
    const body = loggedIn ? await Storage.server.get('/api/scans') : null;
    const serverScans = body?.scans;

    if (Array.isArray(serverScans)) {
      // Server is authoritative. Map each server row to the render shape.
      historyData = serverScans.map(scan => ({
        id: scan.id,
        date: scan.created_at,
        analysis: scan.result_json,
        image_urls: scan.image_urls || null,
      }));
    } else {
      // Anonymous OR server unreachable — fall back to local cache.
      historyData = (Storage.get('tinkskin_history') || []).slice();
    }
    historyData.sort((a, b) => new Date(b.date || b.id) - new Date(a.date || a.id));

    try {
      const photos = await PhotoDB.getAll();
      photos.forEach(p => {
        const day = new Date(p.scanAt).toDateString();
        if (!photosByDay[day]) photosByDay[day] = [];
        photosByDay[day].push(p);
      });
    } catch (_) {}

    document.getElementById('history-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'view')         _viewRoutine(id);
      if (btn.dataset.action === 'del')          _deleteEntry(id);
      if (btn.dataset.action === 'compare-pick') {
        const picker = document.getElementById('picker-' + id);
        if (picker) picker.hidden = !picker.hidden;
      }
    });

    document.getElementById('history-list').addEventListener('change', e => {
      const sel = e.target.closest('.hc-picker-select');
      if (!sel || !sel.value) return;
      const entryId = sel.dataset.entryId;
      const prevId  = sel.value;
      sel.value = '';
      _compareScans(entryId, prevId);
    });

    _render();
  }

  function _render() {
    const listEl  = document.getElementById('history-list');
    const emptyEl = document.getElementById('history-empty');
    const bulkEl  = document.getElementById('history-bulk');
    const countEl = document.getElementById('history-count');

    listEl.innerHTML = '';

    if (historyData.length === 0) {
      emptyEl.classList.remove('hidden');
      bulkEl.classList.add('hidden');
      if (countEl) countEl.textContent = '';
      return;
    }

    emptyEl.classList.add('hidden');
    bulkEl.classList.remove('hidden');
    if (countEl) {
      countEl.textContent = `${historyData.length} scan${historyData.length !== 1 ? 's' : ''} on file`;
    }

    const reversed = [...historyData].reverse();
    reversed.forEach(entry => {
      const isLegacy = !entry.analysis;
      const score    = isLegacy ? entry.overallHealth    : entry.analysis.overallHealth;
      const skinType = isLegacy ? entry.skinType         : entry.analysis.skinType;
      const concerns = isLegacy ? (entry.concerns || []) : (entry.analysis.concerns || []);
      const entryId  = String(entry.id || entry.date);
      // Prefer entry.date for date display. Server scans have small bigint ids
      // (1, 2, 3...) — passing those into new Date() returns 1970-01-01.
      // Local entries from saveToHistory keep id = data.savedAt (a real ms
      // timestamp), so falling back to id is still correct for local-only
      // entries that lack a date field.
      const dateObj  = new Date(entry.date || entry.id);
      const dayKey   = dateObj.toDateString();
      // entryMs is used to find the closest progress photo. Use the date,
      // not the bigint id, for the same reason.
      const entryMs  = entry.date ? dateObj.getTime() : (entry.id || dateObj.getTime());

      let thumbSrc = null;
      const dayPhotos = photosByDay[dayKey] || [];
      if (dayPhotos.length > 0) {
        const closest = [...dayPhotos].sort(
          (a, b) => Math.abs(a.scanAt - entryMs) - Math.abs(b.scanAt - entryMs)
        )[0];
        thumbSrc = URL.createObjectURL(closest.blob);
      }
      // Cross-device: when IndexedDB doesn't have the photo (because this
      // scan happened on another device), fetch the first Drive webViewLink
      // via authenticated XHR and display as a blob URL. drive.file scope
      // means an anonymous <img> tag would 404, so we have to authenticate.
      const driveFileId = !thumbSrc && Array.isArray(entry.image_urls) && entry.image_urls.length
        ? driveFileIdFromUrl(entry.image_urls[0])
        : null;

      const dateLabel = dateObj.toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      });

      const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';

      const concernsHTML = concerns.slice(0, 4).map(c => {
        const cls = c.severity > 60 ? 'hc-tag--high' : c.severity > 30 ? 'hc-tag--med' : 'hc-tag--low';
        return `<span class="hc-tag ${cls}">${c.name}</span>`;
      }).join('');

      const eligiblePeers = historyData
        .filter(e => String(e.id || '').includes('-') && !!e.analysis && String(e.id) !== entryId)
        .sort((a, b) => new Date(b.id || b.date) - new Date(a.id || a.date));

      const canCompare = (
        !isLegacy &&
        typeof entry.id === 'string' && entry.id.includes('-') &&
        eligiblePeers.length > 0
      );

      const eligibleOptions = eligiblePeers.map(e => {
        const d = new Date(e.id || e.date);
        const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return `<option value="${String(e.id)}">${label}</option>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'history-card';
      const thumbId = `hc-thumb-img-${entryId}`;
      card.innerHTML = `
        <div class="hc-thumb${thumbSrc || driveFileId ? '' : ' hc-thumb--empty'}">
          ${thumbSrc
            ? `<img src="${thumbSrc}" alt="Scan photo from ${dateLabel}" />`
            : driveFileId
              ? `<img id="${thumbId}" alt="Scan photo from ${dateLabel}" style="opacity:0.4;" />`
              : '<span>NO<br>PHOTO</span>'}
        </div>
        <div class="hc-body">
          <div class="hc-meta">
            <span class="hc-date">${dateLabel}</span>
            <span class="hc-score" style="color:${scoreColor};border-color:${scoreColor};">${score}/100</span>
          </div>
          ${skinType ? `<div class="hc-skin-type">${skinType}</div>` : ''}
          ${concernsHTML ? `<div class="hc-concerns">${concernsHTML}</div>` : ''}
          ${isLegacy ? '<p class="hc-legacy">Limited data — re-scan to enable routine view</p>' : ''}
          <div class="hc-actions">
            ${!isLegacy
              ? `<button class="btn btn-primary btn-sm" data-action="view" data-id="${entryId}">VIEW ROUTINE</button>`
              : ''}
            ${canCompare
              ? `<button class="btn-ghost btn-sm" data-action="compare-pick" data-id="${entryId}">compare ↕</button>`
              : ''}
            <button class="btn-ghost btn-sm" data-action="del" data-id="${entryId}">DELETE</button>
          </div>
          ${canCompare ? `
          <div class="hc-compare-picker" id="picker-${entryId}" hidden>
            <select class="hc-picker-select" data-entry-id="${entryId}">
              <option value="">compare with…</option>
              ${eligibleOptions}
            </select>
          </div>` : ''}
          <div class="hc-compare-panel" id="compare-${entryId}" hidden></div>
        </div>`;

      listEl.appendChild(card);

      // Drive thumbnail fetch (post-append so the <img> exists in DOM).
      if (driveFileId) {
        driveBlobUrl(driveFileId).then(url => {
          if (!url) return;
          const img = document.getElementById(thumbId);
          if (img) { img.src = url; img.style.opacity = '1'; }
        });
      }
    });
  }

  function _viewRoutine(id) {
    const entry = historyData.find(e => String(e.id || e.date) === id);
    if (!entry || !entry.analysis) return;
    localStorage.setItem('tinkskin_analysis', JSON.stringify({ ...entry.analysis, savedAt: Date.now() }));
    if (typeof window.showSection === 'function') {
      window.showSection('routine');
    } else {
      window.location.href = '/dashboard.html#routine';
    }
  }

  function _deleteEntry(id) {
    const idx = historyData.findIndex(e => String(e.id || e.date) === id);
    if (idx === -1) return;
    const entry = historyData.splice(idx, 1)[0];
    Storage.set('tinkskin_history', historyData);

    // Server-backed entries: also DELETE on the server, otherwise the next
    // _init re-merges them from /api/scans and the row "respawns".
    // Server scans have small bigint IDs (<= 1e12); local entries use
    // Date.now() (>= 1.7e12). Use that to tell them apart.
    const looksLikeServerId = typeof entry.id === 'number' && entry.id < 1e12;
    if (looksLikeServerId && Storage?.server?.delete) {
      Storage.server.delete('/api/scans/' + entry.id).catch(() => {});
    }

    const entryMs = entry.date ? new Date(entry.date).getTime() : (entry.id || 0);
    PhotoDB.getAll()
      .then(photos => {
        const match = photos.find(p => p.scanAt === entryMs);
        if (match) return PhotoDB.remove(match.id);
      })
      .catch(() => {});
    _render();
  }

  async function _compareScans(entryId, prevEntryId) {
    const panel = document.getElementById('compare-' + entryId);
    if (!panel) return;

    const picker = document.getElementById('picker-' + entryId);
    if (picker) picker.hidden = true;

    if (panel.dataset.loaded === 'true' && panel.dataset.comparedWith === String(prevEntryId)) {
      panel.hidden = !panel.hidden;
      return;
    }
    panel.dataset.loaded = 'false';
    panel.dataset.comparedWith = String(prevEntryId);

    panel.innerHTML = '<div class="hc-compare-loading"><span class="hc-spinner"></span> comparing scans…</div>';
    panel.hidden = false;

    try {
      const entry     = historyData.find(e => String(e.id) === String(entryId));
      const prevEntry = historyData.find(e => String(e.id) === String(prevEntryId));
      const urlOlder  = prevEntry?.image_urls?.[0];
      const urlNewer  = entry?.image_urls?.[0];
      const hasPhotos = !!(urlOlder && urlNewer);

      let objUrlOlder = null, objUrlNewer = null;

      if (hasPhotos) {
        const googleToken = window.Auth ? await window.Auth.getProviderToken() : null;
        if (!googleToken) {
          panel.innerHTML = '<p class="hc-compare-error">sign in with google + hook up drive to use compare.</p>';
          return;
        }

        async function fetchDriveBlob(webViewLink) {
          const match = /\/d\/([^/]+)/.exec(webViewLink);
          if (!match) throw Object.assign(new Error('Unrecognised Drive URL'), { type: 'parse' });
          const fileId = match[1];
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${googleToken}` } }
          );
          if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Drive auth failed'), { type: 'auth' });
          if (!res.ok) throw Object.assign(new Error(`Drive ${res.status}`), { type: 'fetch' });
          return res.blob();
        }

        let blobOlder, blobNewer;
        try {
          [blobOlder, blobNewer] = await Promise.all([fetchDriveBlob(urlOlder), fetchDriveBlob(urlNewer)]);
        } catch (err) {
          panel.innerHTML = err.type === 'auth'
            ? '<p class="hc-compare-error">Drive access expired. Re-enable Drive backup to refresh access.</p>'
            : '<p class="hc-compare-error">Couldn\'t load photo from Drive. Try again.</p>';
          return;
        }

        objUrlOlder = URL.createObjectURL(blobOlder);
        objUrlNewer = URL.createObjectURL(blobNewer);
      }

      const supabaseToken = window.Auth ? await window.Auth.getToken() : null;
      if (!supabaseToken) {
        if (hasPhotos) { URL.revokeObjectURL(objUrlOlder); URL.revokeObjectURL(objUrlNewer); }
        panel.innerHTML = '<p class="hc-compare-error">sign in to use compare.</p>';
        return;
      }

      const form = new FormData();
      form.append('scan_a_id', String(prevEntryId));
      form.append('scan_b_id', String(entryId));
      if (hasPhotos) {
        form.append('image_a', blobOlder, 'scan_a.jpg');
        form.append('image_b', blobNewer, 'scan_b.jpg');
      }

      const apiRes = await fetch('/api/compare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseToken}` },
        body: form,
      });

      if (!apiRes.ok) {
        if (hasPhotos) { URL.revokeObjectURL(objUrlOlder); URL.revokeObjectURL(objUrlNewer); }
        if (apiRes.status === 404)      panel.innerHTML = '<p class="hc-compare-error">scan not found.</p>';
        else if (apiRes.status === 429) panel.innerHTML = '<p class="hc-compare-error">AI is cooked rn. wait a sec.</p>';
        else                            panel.innerHTML = '<p class="hc-compare-error">compare failed. try again.</p>';
        return;
      }

      const { narrative } = await apiRes.json();

      const narrativeEl = document.createElement('p');
      narrativeEl.className = 'hc-compare-narrative';
      narrativeEl.textContent = narrative;
      panel.innerHTML = `
        ${hasPhotos ? `<div class="hc-compare-photos">
          <img src="${objUrlOlder}" alt="Earlier scan" />
          <img src="${objUrlNewer}" alt="Recent scan" />
        </div>` : ''}
        <button class="btn-ghost btn-sm hc-compare-close">Close</button>`;
      panel.insertBefore(narrativeEl, panel.querySelector('.hc-compare-close'));
      panel.dataset.loaded = 'true';

      panel.querySelector('.hc-compare-close').addEventListener('click', () => { panel.hidden = true; });

      if (hasPhotos) {
        window.addEventListener('beforeunload', () => {
          URL.revokeObjectURL(objUrlOlder);
          URL.revokeObjectURL(objUrlNewer);
        }, { once: true });
      }

    } catch (err) {
      console.error('[compareScans]', err);
      panel.innerHTML = '<p class="hc-compare-error">compare failed. try again.</p>';
    }
  }

  // ── Compare section: standalone picker UI in dashboard ───────────
  async function _mountCompare() {
    if (_compareMounted) return;
    _compareMounted = true;

    // Need history data loaded for compare to work
    if (!_mounted) await _init().catch(() => {});

    const emptyEl  = document.getElementById('compare-empty');
    const pickerUi = document.getElementById('compare-picker-ui');
    const selectA  = document.getElementById('compare-select-a');
    const selectB  = document.getElementById('compare-select-b');
    const runBtn   = document.getElementById('compare-run-btn');
    const resultEl = document.getElementById('compare-result-panel');

    const eligible = historyData
      .filter(e => typeof e.id === 'string' && e.id.includes('-') && !!e.analysis)
      .sort((a, b) => new Date(b.id || b.date) - new Date(a.id || a.date));

    if (eligible.length < 2) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (pickerUi) pickerUi.classList.remove('hidden');

    function buildOptions(sel) {
      const opts = eligible.map(e => {
        const d = new Date(e.id || e.date);
        return `<option value="${e.id}">${d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</option>`;
      }).join('');
      sel.innerHTML = `<option value="">pick a scan…</option>${opts}`;
    }

    buildOptions(selectA);
    buildOptions(selectB);

    function checkReady() {
      runBtn.disabled = !(selectA.value && selectB.value && selectA.value !== selectB.value);
    }
    selectA.addEventListener('change', checkReady);
    selectB.addEventListener('change', checkReady);

    runBtn.addEventListener('click', async () => {
      if (!selectA.value || !selectB.value) return;
      resultEl.innerHTML = '<div class="hc-compare-loading"><span class="hc-spinner"></span> comparing…</div>';
      resultEl.classList.remove('hidden');

      // Determine which is older/newer by date
      const entryA = eligible.find(e => String(e.id) === selectA.value);
      const entryB = eligible.find(e => String(e.id) === selectB.value);
      const older  = new Date(entryA.id) < new Date(entryB.id) ? entryA : entryB;
      const newer  = older === entryA ? entryB : entryA;

      await _compareScansToEl(String(older.id), String(newer.id), resultEl);
    });
  }

  async function _compareScansToEl(olderEntryId, newerEntryId, resultEl) {
    try {
      const supabaseToken = window.Auth ? await window.Auth.getToken() : null;
      if (!supabaseToken) {
        resultEl.innerHTML = '<p class="hc-compare-error">Sign in to use comparison.</p>';
        return;
      }
      const form = new FormData();
      form.append('scan_a_id', olderEntryId);
      form.append('scan_b_id', newerEntryId);
      const apiRes = await fetch('/api/compare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseToken}` },
        body: form,
      });
      if (!apiRes.ok) {
        resultEl.innerHTML = apiRes.status === 429
          ? '<p class="hc-compare-error">AI is cooked rn. wait a sec.</p>'
          : '<p class="hc-compare-error">compare failed. try again.</p>';
        return;
      }
      const { narrative } = await apiRes.json();
      resultEl.innerHTML = `<p class="hc-compare-narrative">${narrative}</p>`;
    } catch (err) {
      resultEl.innerHTML = '<p class="hc-compare-error">compare failed. try again.</p>';
    }
  }

  // ── Public exports ───────────────────────────────────────────────
  window.clearAll = function () {
    if (!confirm('nuke all scan history + saved pics? no take-backs fr.')) return;
    historyData = [];
    Storage.set('tinkskin_history', []);
    PhotoDB.getAll()
      .then(photos => Promise.all(photos.map(p => PhotoDB.remove(p.id))))
      .catch(() => {});
    _render();
  };

  window.exportJSON = function () {
    const payload = JSON.stringify({ history: historyData, exportedAt: new Date().toISOString(), version: 2 }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a   = Object.assign(document.createElement('a'), { href: url, download: `tinkskin-history-${Date.now()}.json` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    mount() {
      if (_mounted) return;
      _mounted = true;
      _init();
    },
    mountCompare() {
      _mountCompare();
    }
  };
})();
