(async function () {
  // ── Auth gate ────────────────────────────────────────────────────
  if (!window.Auth) {
    window.location.href = '/';
    return;
  }

  const user = await window.Auth.getUser();
  if (!user) {
    sessionStorage.setItem('dermai_redirect', '/dashboard.html');
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

  // ── Section routing ──────────────────────────────────────────────
  const SECTIONS = ['overview', 'routine', 'history', 'ingredients', 'shopping', 'compare'];
  const mounted  = {};

  function showSection(key) {
    if (!SECTIONS.includes(key)) key = 'overview';

    // Update sections
    document.querySelectorAll('.dash-section').forEach(el => {
      el.classList.toggle('active', el.dataset.section === key);
    });

    // Update sidebar active state
    document.querySelectorAll('.dash-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.section === key);
    });

    // Push hash without scroll jump
    history.replaceState(null, '', '#' + key);

    // Lazy-mount section modules on first reveal
    if (key === 'history' && !mounted.history) {
      History.mount();
      mounted.history = true;
    }
    if (key === 'ingredients' && !mounted.ingredients) {
      Ingredients.mount();
      mounted.ingredients = true;
    }
    if (key === 'shopping' && !mounted.shopping) {
      Shopping.mount();
      mounted.shopping = true;
    }
    if (key === 'compare' && !mounted.compare) {
      History.mountCompare();
      mounted.compare = true;
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

  async function loadOverview(user) {
    const totalEl  = document.getElementById('stat-total-scans');
    const streakEl = document.getElementById('stat-streak');
    const scoreEl  = document.getElementById('stat-latest-score');
    const recentEl = document.getElementById('dash-recent-grid');

    // Load from localStorage first (fast)
    const localHistory = (Storage.get('dermAI_history') || []);
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
            <h2>No scans yet</h2>
            <p>Take your first AI skin analysis to start tracking your progress.</p>
            <a href="/analyze.html" class="btn btn-primary">Analyze My Skin</a>
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
