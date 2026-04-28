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
          historyData.push({ id, date: scan.created_at, analysis: scan.result_json });
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
      if (btn.dataset.action === 'view') viewRoutine(id);
      if (btn.dataset.action === 'del')  deleteEntry(id);
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

    [...historyData].reverse().forEach(entry => {
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
            <button class="btn-ghost btn-sm" data-action="del" data-id="${entryId}">DELETE</button>
          </div>
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
