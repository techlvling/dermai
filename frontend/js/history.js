(async function () {
  let historyData = [];
  const photosByDay = {};

  async function init() {
    historyData = (Storage.get('dermAI_history') || []).slice();

    // Merge server scans when logged in
    const body = await Storage.server.get('/api/scans');
    const serverScans = body?.scans;
    if (serverScans && Array.isArray(serverScans)) {
      const localIds = new Set(historyData.map(e => String(e.id || e.date)));
      for (const scan of serverScans) {
        const id = scan.id || new Date(scan.created_at).getTime();
        if (!localIds.has(String(id))) {
          historyData.push({ id, date: scan.created_at, analysis: scan.result_json, image_urls: scan.image_urls || null });
        }
      }
      historyData.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

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
      if (btn.dataset.action === 'view')    viewRoutine(id);
      if (btn.dataset.action === 'del')     deleteEntry(id);
      if (btn.dataset.action === 'compare') compareScans(id, btn.dataset.prevId);
    });

    render();
  }

  function render() {
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
      countEl.textContent = `${historyData.length} scan${historyData.length !== 1 ? 's' : ''} stored on this device`;
    }

    const reversed = [...historyData].reverse();
    reversed.forEach((entry, idx) => {
      const isLegacy = !entry.analysis;
      const score    = isLegacy ? entry.overallHealth    : entry.analysis.overallHealth;
      const skinType = isLegacy ? entry.skinType         : entry.analysis.skinType;
      const concerns = isLegacy ? (entry.concerns || []) : (entry.analysis.concerns || []);
      const entryId  = String(entry.id || entry.date);
      const dateObj  = new Date(entry.id || entry.date);
      const dayKey   = dateObj.toDateString();
      const entryMs  = entry.id || dateObj.getTime();

      let thumbSrc = null;
      const dayPhotos = photosByDay[dayKey] || [];
      if (dayPhotos.length > 0) {
        const closest = [...dayPhotos].sort(
          (a, b) => Math.abs(a.scanAt - entryMs) - Math.abs(b.scanAt - entryMs)
        )[0];
        thumbSrc = URL.createObjectURL(closest.blob);
      }

      const dateLabel = dateObj.toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      });

      const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';

      const concernsHTML = concerns.slice(0, 4).map(c => {
        const cls = c.severity > 60 ? 'hc-tag--high' : c.severity > 30 ? 'hc-tag--med' : 'hc-tag--low';
        return `<span class="hc-tag ${cls}">${c.name}</span>`;
      }).join('');

      const prevEntry = idx > 0 ? reversed[idx - 1] : null;
      const canCompare = (
        !isLegacy &&
        typeof entry.id === 'string' && entry.id.includes('-') &&
        Array.isArray(entry.image_urls) && entry.image_urls[0] &&
        prevEntry != null &&
        !!prevEntry.analysis &&
        typeof prevEntry.id === 'string' && prevEntry.id.includes('-') &&
        Array.isArray(prevEntry.image_urls) && prevEntry.image_urls[0]
      );

      const card = document.createElement('div');
      card.className = 'history-card';

      card.innerHTML = `
        <div class="hc-thumb${thumbSrc ? '' : ' hc-thumb--empty'}">
          ${thumbSrc
            ? `<img src="${thumbSrc}" alt="Scan photo from ${dateLabel}" />`
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
              ? `<button class="btn-ghost btn-sm" data-action="compare" data-id="${entryId}" data-prev-id="${String(prevEntry.id)}">Compare ↕</button>`
              : ''}
            <button class="btn-ghost btn-sm" data-action="del" data-id="${entryId}">DELETE</button>
          </div>
          <div class="hc-compare-panel" id="compare-${entryId}" hidden></div>
        </div>
      `;

      listEl.appendChild(card);
    });
  }

  function viewRoutine(id) {
    const entry = historyData.find(e => String(e.id || e.date) === id);
    if (!entry || !entry.analysis) return;
    localStorage.setItem('dermAI_analysis', JSON.stringify({ ...entry.analysis, savedAt: Date.now() }));
    window.location.href = '/recommendations.html';
  }

  function deleteEntry(id) {
    const idx = historyData.findIndex(e => String(e.id || e.date) === id);
    if (idx === -1) return;
    const entry = historyData.splice(idx, 1)[0];
    Storage.set('dermAI_history', historyData);

    const entryMs = entry.id || new Date(entry.date).getTime();
    PhotoDB.getAll()
      .then(photos => {
        const match = photos.find(p => p.scanAt === entryMs);
        if (match) return PhotoDB.remove(match.id);
      })
      .catch(() => {});

    render();
  }

  async function compareScans(entryId, prevEntryId) {
    const panel = document.getElementById('compare-' + entryId);
    if (!panel) return;

    // Toggle if already loaded
    if (panel.dataset.loaded === 'true') {
      panel.hidden = !panel.hidden;
      return;
    }

    panel.innerHTML = '<div class="hc-compare-loading"><span class="hc-spinner"></span> Comparing scans…</div>';
    panel.hidden = false;

    try {
      const googleToken = window.Auth ? await window.Auth.getProviderToken() : null;
      if (!googleToken) {
        panel.innerHTML = '<p class="hc-compare-error">Sign in with Google and enable Drive backup to use comparison.</p>';
        return;
      }

      const entry     = historyData.find(e => String(e.id) === String(entryId));
      const prevEntry = historyData.find(e => String(e.id) === String(prevEntryId));
      const urlOlder  = prevEntry?.image_urls?.[0];
      const urlNewer  = entry?.image_urls?.[0];

      if (!urlOlder || !urlNewer) {
        panel.innerHTML = '<p class="hc-compare-error">This scan doesn\'t have a saved photo. Enable Drive backup before scanning to use comparison.</p>';
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
        if (res.status === 401 || res.status === 403) {
          throw Object.assign(new Error('Drive auth failed'), { type: 'auth' });
        }
        if (!res.ok) throw Object.assign(new Error(`Drive ${res.status}`), { type: 'fetch' });
        return res.blob();
      }

      let blobOlder, blobNewer;
      try {
        [blobOlder, blobNewer] = await Promise.all([
          fetchDriveBlob(urlOlder),
          fetchDriveBlob(urlNewer),
        ]);
      } catch (err) {
        if (err.type === 'auth') {
          panel.innerHTML = '<p class="hc-compare-error">Drive access expired. Re-enable Drive backup to refresh access.</p>';
        } else {
          panel.innerHTML = '<p class="hc-compare-error">Couldn\'t load photo from Drive. Try again.</p>';
        }
        return;
      }

      const objUrlOlder = URL.createObjectURL(blobOlder);
      const objUrlNewer = URL.createObjectURL(blobNewer);

      const supabaseToken = window.Auth ? await window.Auth.getToken() : null;
      if (!supabaseToken) {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
        panel.innerHTML = '<p class="hc-compare-error">Sign in to use comparison.</p>';
        return;
      }

      const form = new FormData();
      form.append('scan_a_id', String(prevEntryId));  // older scan = image_a
      form.append('scan_b_id', String(entryId));       // newer scan = image_b
      form.append('image_a', blobOlder, 'scan_a.jpg');
      form.append('image_b', blobNewer, 'scan_b.jpg');

      const apiRes = await fetch('/api/compare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseToken}` },
        body: form,
      });

      if (!apiRes.ok) {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
        if (apiRes.status === 404) {
          panel.innerHTML = '<p class="hc-compare-error">Scan not found.</p>';
        } else if (apiRes.status === 429) {
          panel.innerHTML = '<p class="hc-compare-error">AI rate limit reached. Wait a moment and try again.</p>';
        } else {
          panel.innerHTML = '<p class="hc-compare-error">Comparison failed. Try again.</p>';
        }
        return;
      }

      const { narrative } = await apiRes.json();

      const narrativeEl = document.createElement('p');
      narrativeEl.className = 'hc-compare-narrative';
      narrativeEl.textContent = narrative;
      panel.innerHTML = `
        <div class="hc-compare-photos">
          <img src="${objUrlOlder}" alt="Earlier scan" />
          <img src="${objUrlNewer}" alt="Recent scan" />
        </div>
        <button class="btn-ghost btn-sm hc-compare-close">Close</button>
      `;
      panel.insertBefore(narrativeEl, panel.querySelector('.hc-compare-close'));
      panel.dataset.loaded = 'true';

      panel.querySelector('.hc-compare-close').addEventListener('click', () => {
        panel.hidden = true;
      });

      window.addEventListener('beforeunload', () => {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
      }, { once: true });

    } catch (err) {
      console.error('[compareScans]', err);
      panel.innerHTML = '<p class="hc-compare-error">Comparison failed. Try again.</p>';
    }
  }

  window.clearAll = function () {
    if (!confirm('Delete all scan history and saved photos? This cannot be undone.')) return;
    historyData = [];
    Storage.set('dermAI_history', []);
    PhotoDB.getAll()
      .then(photos => Promise.all(photos.map(p => PhotoDB.remove(p.id))))
      .catch(() => {});
    render();
  };

  window.exportJSON = function () {
    const payload = JSON.stringify(
      { history: historyData, exportedAt: new Date().toISOString(), version: 2 },
      null, 2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: `dermAI-history-${Date.now()}.json`
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  init();
})();
