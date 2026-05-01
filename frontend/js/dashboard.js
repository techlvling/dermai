(async function () {
  // ── Auth gate ────────────────────────────────────────────────────
  if (!window.Auth) {
    window.location.href = '/';
    return;
  }

  const user = await window.Auth.getUser();
  if (!user) {
    sessionStorage.setItem('tinkskin_redirect', '/dashboard.html');
    window.location.href = '/';
    return;
  }

  // ── Populate user info in sidebar ────────────────────────────────
  const avatarEl = document.getElementById('dash-avatar');
  const nameEl   = document.getElementById('dash-username');
  if (avatarEl) avatarEl.src = user.user_metadata?.avatar_url || '';
  if (nameEl)   nameEl.textContent = user.email || user.user_metadata?.full_name || 'Your Account';

  const signoutBtn = document.getElementById('dash-signout');
  if (signoutBtn) signoutBtn.addEventListener('click', () => window.Auth.signOut().then(() => { window.location.href = '/'; }));

  // ── One-time Drive scope prompt at first dashboard visit ─────────
  // Granting Drive scope at login (before scanning) means the scan flow
  // doesn't have to redirect mid-upload (which would lose the in-memory
  // photos). We only ask once: if the user clicks Allow OR Skip, the
  // banner never reappears on dashboard. Scan-time fallback in upload.js
  // covers anyone who skipped here.
  if (typeof Drive !== 'undefined'
      && !Drive.hasScope()
      && localStorage.getItem('tinkskin_drive_declined') !== 'true') {
    const banner = document.createElement('div');
    banner.className = 'drive-login-banner';
    banner.style.cssText = 'position:sticky; top:0; z-index:50; padding:0.875rem 1.25rem; background:rgba(245,88,142,0.06); border-bottom:1px solid rgba(245,88,142,0.18); display:flex; align-items:center; gap:1rem; flex-wrap:wrap; font-size:0.875rem;';
    banner.innerHTML = `
      <span style="flex:1; min-width:200px;">
        <strong>back up ur pics to google drive?</strong>
        say yes now and future scans auto-save without an extra redirect.
      </span>
      <button class="btn btn-primary" id="drive-login-allow" style="padding:0.4rem 0.875rem; font-size:0.78rem;">hook up drive</button>
      <button class="link-btn link-btn--muted" id="drive-login-skip">nah skip</button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    document.getElementById('drive-login-allow').addEventListener('click', () => {
      Drive.requestDriveScope(); // redirects to OAuth
    });
    document.getElementById('drive-login-skip').addEventListener('click', () => {
      localStorage.setItem('tinkskin_drive_declined', 'true');
      banner.remove();
    });
  }

  // ── Section routing ──────────────────────────────────────────────
  // Compare stays a section but no longer has a top-level sidebar tab —
  // it's reached via a "Compare two scans →" link inside History.
  // Diary was removed in Phase 7 — lifestyle entries now happen in the
  // post-scan modal (LifestyleModal) and the heatmaps live on Overview.
  const SECTIONS = ['overview', 'treatment', 'routine', 'history', 'ingredients', 'compare', 'connections'];
  const mounted  = {};

  function showSection(key) {
    if (!SECTIONS.includes(key)) key = 'overview';

    // Update sections
    document.querySelectorAll('.dash-section').forEach(el => {
      el.classList.toggle('active', el.dataset.section === key);
    });

    // Update sidebar active state. Compare has no nav link of its own —
    // when it's active, leave the History link highlighted as its parent.
    const navKey = key === 'compare' ? 'history' : key;
    document.querySelectorAll('.dash-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.section === navKey);
    });

    // Push hash without scroll jump
    history.replaceState(null, '', '#' + key);

    // Lazy-mount section modules on first reveal
    if (key === 'treatment' && !mounted.treatment) {
      if (window.Treatment) Treatment.mount();
      mounted.treatment = true;
    }
    if (key === 'history' && !mounted.history) {
      History.mount();
      mounted.history = true;
    }
    if (key === 'ingredients' && !mounted.ingredients) {
      Ingredients.mount();
      mounted.ingredients = true;
    }
    if (key === 'compare' && !mounted.compare) {
      History.mountCompare();
      mounted.compare = true;
    }
    if (key === 'connections') {
      // Always re-render — status can change between visits (after grant flow
      // returns the user lands here with new scope; after Forget the flag flips).
      renderConnections();
    }
  }

  async function testDriveConnection() {
    const out = document.getElementById('conn-drive-test-output');
    if (!out) return;
    out.style.display = 'block';
    out.textContent = '';
    const log = (msg, ok) => {
      const icon = ok === true ? '✓' : ok === false ? '✗' : '·';
      out.textContent += `${icon} ${msg}\n`;
    };

    log('Starting Drive diagnostic…');
    log('');

    // Step 1: scope flag
    const scoped = Drive.hasScope();
    log(`Step 1: Drive.hasScope() = ${scoped}`, scoped);
    if (!scoped) { log('Stop: scope flag not set. Click "Connect Google Drive" first.', false); return; }

    // Step 2: provider_token
    let token = null;
    try { token = await window.Auth.getProviderToken(); } catch (e) { log(`Step 2: getProviderToken threw: ${e.message}`, false); return; }
    if (!token) { log('Step 2: provider_token is null. Sign out + sign in to refresh.', false); return; }
    log(`Step 2: provider_token present (len=${token.length})`, true);

    // Step 3: ping Drive about-me to confirm token is valid + which account
    try {
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!aboutRes.ok) {
        const body = await aboutRes.text();
        log(`Step 3: Drive about endpoint returned ${aboutRes.status}: ${body.slice(0, 200)}`, false);
        return;
      }
      const about = await aboutRes.json();
      log(`Step 3: Drive sees you as ${about.user.emailAddress} (${about.user.displayName})`, true);
      const used = Math.round(Number(about.storageQuota?.usage || 0) / 1e6);
      const total = about.storageQuota?.limit ? Math.round(Number(about.storageQuota.limit) / 1e6) : '?';
      log(`         storage: ${used} MB used of ${total} MB`);
    } catch (e) { log(`Step 3: about call threw: ${e.message}`, false); return; }

    // Step 4: ensureScansFolder
    let folderId = null;
    try {
      folderId = await Drive.ensureScansFolder();
      log(`Step 4: ensureScansFolder() = ${folderId}`, true);
    } catch (e) { log(`Step 4: ensureScansFolder threw: ${e.message}`, false); return; }

    // Step 5: list files in folder
    try {
      const q = `'${folderId}' in parents and trashed=false`;
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,webViewLink)&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) { log(`Step 5: list files returned ${listRes.status}`, false); return; }
      const list = await listRes.json();
      log(`Step 5: folder contains ${list.files.length} file(s):`, true);
      list.files.slice(0, 5).forEach(f => log(`         · ${f.name} (${f.createdTime?.slice(0, 10)})`));
    } catch (e) { log(`Step 5: list files threw: ${e.message}`, false); return; }

    // Step 6: upload a tiny test file
    let testFileId = null;
    try {
      const blob = new Blob([`tinkskin Drive test ${new Date().toISOString()}`], { type: 'text/plain' });
      const file = new File([blob], `tinkskin-test-${Date.now()}.txt`, { type: 'text/plain' });
      const result = await Drive.uploadPhoto(file, file.name, folderId);
      testFileId = result?.id;
      log(`Step 6: uploaded test file → ${testFileId} (${result?.webViewLink || 'no link'})`, true);
    } catch (e) { log(`Step 6: uploadPhoto threw: ${e.message}`, false); return; }

    // Step 7: clean up the test file
    if (testFileId) {
      try {
        await Drive.deletePhoto(testFileId);
        log(`Step 7: deleted test file ${testFileId}`, true);
      } catch (e) { log(`Step 7: deletePhoto threw: ${e.message}`, false); }
    }

    log('');
    log('Done. If steps 1-6 all show ✓, Drive backup is working end-to-end.', true);
    log('If real scan backups still aren\'t showing in Drive, the issue is in the post-scan flow, not the Drive auth.');
  }

  function renderConnections() {
    const statusEl  = document.getElementById('conn-drive-status');
    const actionsEl = document.getElementById('conn-drive-actions');
    if (!statusEl || !actionsEl) return;
    if (typeof Drive === 'undefined') {
      statusEl.textContent = 'Unavailable';
      statusEl.className   = 'conn-card__status conn-card__status--off';
      actionsEl.innerHTML  = '<p class="conn-help">Drive integration is not loaded on this page. Refresh and try again.</p>';
      return;
    }
    const granted  = Drive.hasScope();
    const declined = localStorage.getItem('tinkskin_drive_declined') === 'true';

    if (granted) {
      statusEl.textContent = 'hooked up ✓';
      statusEl.className   = 'conn-card__status conn-card__status--on';
      actionsEl.innerHTML = `
        <p class="conn-help">scans save to <code>tinkskin Photos/Scans/Day N - DATE/</code> in ur drive, organized by days since ur first scan.</p>
        <div class="conn-actions-row">
          <button type="button" class="btn btn-primary" id="conn-drive-open">open my drive folder</button>
          <button type="button" class="btn btn-outline" id="conn-drive-test">test if it works</button>
          <button type="button" class="btn btn-outline" id="conn-drive-forget">yeet</button>
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener" class="link-btn">revoke at google →</a>
        </div>
        <pre id="conn-drive-test-output" style="display:none; margin-top:1rem; padding:0.875rem; background:#0f172a; color:#e2e8f0; border-radius:8px; font-family:ui-monospace, monospace; font-size:0.72rem; line-height:1.45; white-space:pre-wrap; max-height:280px; overflow:auto;"></pre>
      `;
      document.getElementById('conn-drive-open').addEventListener('click', async () => {
        const btn = document.getElementById('conn-drive-open');
        btn.disabled = true;
        btn.textContent = 'looking up folder…';
        try {
          // Resolve fresh — don't trust localStorage cache that may have
          // been cleared since last sign-in.
          const folderId = await Drive.ensureScansFolder();
          if (folderId) {
            window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, '_blank', 'noopener');
            btn.textContent = 'open my drive folder';
            btn.disabled = false;
          } else {
            btn.textContent = 'folder not found — try the test btn';
          }
        } catch (e) {
          btn.textContent = `couldn't open: ${(e?.message || 'error').slice(0, 60)}`;
        }
      });
      document.getElementById('conn-drive-test').addEventListener('click', () => testDriveConnection());
      document.getElementById('conn-drive-forget').addEventListener('click', () => {
        // Local-only forget. Tells user to revoke at Google for a clean cut.
        localStorage.setItem('tinkskin_drive_declined', 'true');
        localStorage.removeItem('tinkskin-drive-scope');
        localStorage.removeItem('tinkskin-drive-folder-root');
        localStorage.removeItem('tinkskin-drive-folder-scans');
        localStorage.removeItem('tinkskin-drive-folder-progress');
        renderConnections();
      });
    } else {
      statusEl.textContent = declined ? 'declined' : 'not hooked up';
      statusEl.className   = 'conn-card__status conn-card__status--off';
      actionsEl.innerHTML = `
        <p class="conn-help">${declined
          ? 'u skipped the drive prompt earlier. hook it up now to auto-save scan pics.'
          : 'hook up ur google drive so every scan auto-saves to a private folder.'}</p>
        <div class="conn-actions-row">
          <button type="button" class="btn btn-primary" id="conn-drive-grant">hook up google drive</button>
        </div>
      `;
      document.getElementById('conn-drive-grant').addEventListener('click', () => {
        // Granting redirects to OAuth. Clear the declined flag so the post-
        // return state reflects the user's intent.
        localStorage.removeItem('tinkskin_drive_declined');
        Drive.requestDriveScope();
      });
    }
  }

  // Wire sidebar links
  document.querySelectorAll('.dash-nav a[data-section]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showSection(a.dataset.section);
    });
  });

  // Wire "View all history" from overview
  const viewAllBtn = document.getElementById('dash-view-all');
  if (viewAllBtn) viewAllBtn.addEventListener('click', () => showSection('history'));

  // Mobile sidebar open/close
  const hamburger  = document.getElementById('dash-hamburger');
  const sidebar    = document.getElementById('dash-sidebar');
  const overlay    = document.getElementById('dash-overlay');

  function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

  if (hamburger) hamburger.addEventListener('click', openSidebar);
  if (overlay)   overlay.addEventListener('click', closeSidebar);

  // Close sidebar when a nav link is clicked on mobile
  document.querySelectorAll('.dash-nav a').forEach(a => a.addEventListener('click', closeSidebar));

  // ── Navigate to initial section ──────────────────────────────────
  const initialSection = (location.hash.slice(1) || 'overview');
  showSection(initialSection);

  // ── Overview: load stats ─────────────────────────────────────────
  await loadOverview(user);

  // Mount the trends panel (6 heatmaps + correlation + wellness card).
  // Fire-and-forget — has its own loading state and won't block Overview.
  if (window.OverviewTrends) OverviewTrends.mount();

  async function loadOverview(user) {
    const totalEl  = document.getElementById('stat-total-scans');
    const streakEl = document.getElementById('stat-streak');
    const scoreEl  = document.getElementById('stat-latest-score');
    const recentEl = document.getElementById('dash-recent-grid');

    // Load from localStorage first (fast)
    const localHistory = (Storage.get('tinkskin_history') || []);
    let   scans = localHistory.slice();

    // Then merge server scans
    try {
      const body = await Storage.server.get('/api/scans');
      if (body?.scans && Array.isArray(body.scans)) {
        const localIds = new Set(scans.map(e => String(e.id || e.date)));
        for (const scan of body.scans) {
          const id = scan.id || new Date(scan.created_at).getTime();
          if (!localIds.has(String(id))) {
            scans.push({ id, date: scan.created_at, analysis: scan.result_json });
          }
        }
        scans.sort((a, b) => new Date(b.date || b.id) - new Date(a.date || a.id));
      }
    } catch (_) {}

    // Total scans
    if (totalEl) totalEl.textContent = scans.length;

    // Streak (consecutive days with at least one scan, counting backwards from today)
    if (streakEl) streakEl.textContent = calcStreak(scans);

    // Latest score
    const latest = scans[0];
    if (scoreEl) {
      const score = latest?.analysis?.overallHealth ?? latest?.overallHealth ?? null;
      scoreEl.textContent = score !== null ? score : '—';
    }

    // Recent scans grid (up to 3)
    if (recentEl) {
      const recent = scans.slice(0, 3);
      if (recent.length === 0) {
        recentEl.innerHTML = `
          <div class="dash-empty" style="grid-column:1/-1">
            <h2>no scans yet</h2>
            <p>scan ur face to start tracking ur progress.</p>
            <a href="/analyze.html" class="btn btn-primary">scan ur shit</a>
          </div>`;
      } else {
        recentEl.innerHTML = recent.map(entry => {
          const score    = entry.analysis?.overallHealth ?? entry.overallHealth ?? '?';
          const concerns = (entry.analysis?.concerns ?? entry.concerns ?? []).slice(0, 3);
          const dateStr  = new Date(entry.date || entry.id).toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric'
          });
          const scoreColor = score >= 80 ? 'var(--mint-500)' : score >= 60 ? 'var(--peach-500)' : 'var(--error)';
          return `
            <div class="dash-scan-card" onclick="showSection('history')">
              <span class="dash-scan-date">${dateStr}</span>
              <span class="dash-scan-score" style="color:${scoreColor}">${score}<small style="font-size:0.9rem;font-weight:400">/100</small></span>
              <div class="dash-scan-concerns">
                ${concerns.map(c => `<span class="dash-scan-concern-tag">${c.name}</span>`).join('')}
              </div>
            </div>`;
        }).join('');
      }
    }
  }

  function calcStreak(scans) {
    if (!scans.length) return 0;
    const days = new Set(scans.map(e => new Date(e.date || e.id).toDateString()));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }

  // Expose showSection globally so inline onclick="showSection('history')" works
  window.showSection = showSection;
})();
