// Shared nav component — renders navbar + mobile drawer into #nav-mount
// Call: Nav.render('activeKey') e.g. Nav.render('analyze')
// Active keys: home | analyze | dashboard | routine

const _NAV_HAMBURGER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const _NAV_CLOSE     = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

window.Nav = {
  async render(activeKey) {
    const user      = window.Auth ? await window.Auth.getUser() : null;
    const isAuthed  = !!user;

    const links = [
      { key: 'home',      href: '/',                     label: 'Home' },
      { key: 'analyze',   href: '/analyze.html',         label: 'Analyze' },
      isAuthed ? { key: 'dashboard', href: '/dashboard.html',         label: 'Dashboard' } : null,
      isAuthed ? { key: 'routine',   href: '/dashboard.html#routine', label: 'Routine' }   : null,
    ].filter(Boolean);

    function linkHTML(l, isDrawer) {
      const active = activeKey === l.key;
      return `<a href="${l.href}"${active ? ' class="active" aria-current="page"' : ''}>${l.label}</a>`;
    }

    const avatarUrl   = user?.user_metadata?.avatar_url || '';
    const displayName = user?.email || user?.user_metadata?.full_name || '';

    const mount = document.getElementById('nav-mount');
    if (!mount) return;

    mount.innerHTML = `
      <nav class="navbar container" aria-label="Main navigation">
        <div class="logo">
          <a href="/"><span style="color:var(--primary-500)">DermAI</span></a>
        </div>
        <div class="nav-links">
          ${links.map(l => linkHTML(l)).join('')}
        </div>
        <div class="user-menu" id="user-menu">
          <button class="user-menu__signin btn-ghost" id="user-signin-btn"
                  style="display:${isAuthed ? 'none' : 'block'}">SIGN IN</button>
          <div class="user-menu__chip" id="user-chip"
               style="display:${isAuthed ? 'flex' : 'none'}">
            <img class="user-menu__avatar" id="user-avatar" src="${avatarUrl}" alt="avatar" />
            <span class="user-menu__email" id="user-email">${displayName}</span>
            <button class="user-menu__signout btn-ghost" id="user-signout-btn">SIGN OUT</button>
          </div>
        </div>
        <button class="nav-hamburger" aria-label="Open navigation menu"
                aria-expanded="false" aria-controls="nav-drawer">
          ${_NAV_HAMBURGER}
        </button>
      </nav>

      <div class="nav-overlay" id="nav-overlay" aria-hidden="true"></div>
      <nav class="nav-drawer" id="nav-drawer" aria-label="Mobile navigation" aria-hidden="true">
        <div class="nav-drawer-header">
          <span style="font-family:var(--font-display);font-size:1.25rem;font-weight:700;color:var(--primary-500);">DermAI</span>
          <button class="nav-drawer-close" aria-label="Close navigation menu">${_NAV_CLOSE}</button>
        </div>
        <div class="nav-drawer-links">
          ${links.map(l => linkHTML(l, true)).join('')}
        </div>
        <a href="/analyze.html" class="btn btn-primary nav-drawer-cta">Analyze My Skin</a>
        <div style="margin-top:1rem;">
          ${isAuthed
            ? `<button id="drawer-signout-btn" class="btn btn-ghost nav-drawer-cta" style="font-size:0.8rem;">SIGN OUT</button>`
            : `<button id="drawer-signin-btn" class="btn btn-ghost nav-drawer-cta" style="font-size:0.8rem;">SIGN IN</button>`
          }
        </div>
      </nav>`;

    _initDrawer();
    _initUserMenu(user);
  }
};

function _initDrawer() {
  const hamburger = document.querySelector('.nav-hamburger');
  const drawer    = document.getElementById('nav-drawer');
  const overlay   = document.getElementById('nav-overlay');
  const closeBtn  = drawer && drawer.querySelector('.nav-drawer-close');

  if (!hamburger || !drawer || !overlay) return;

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    closeBtn && closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.focus();
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', openDrawer);
  closeBtn && closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  drawer.querySelectorAll('a').forEach(link => link.addEventListener('click', closeDrawer));

  const drawerSignout = document.getElementById('drawer-signout-btn');
  const drawerSignin  = document.getElementById('drawer-signin-btn');
  if (drawerSignout && window.Auth) drawerSignout.addEventListener('click', () => { closeDrawer(); window.Auth.signOut(); });
  if (drawerSignin  && window.Auth) drawerSignin.addEventListener('click',  () => { closeDrawer(); sessionStorage.setItem('dermai_redirect', '/dashboard.html'); window.Auth.signInWithGoogle(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  drawer.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !drawer.classList.contains('open')) return;
    const focusable = Array.from(drawer.querySelectorAll('a, button')).filter(el => !el.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first)       { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last)  { e.preventDefault(); first.focus(); }
  });
}

function _initUserMenu(initialUser) {
  const signinBtn  = document.getElementById('user-signin-btn');
  const chip       = document.getElementById('user-chip');
  const avatar     = document.getElementById('user-avatar');
  const emailEl    = document.getElementById('user-email');
  const signoutBtn = document.getElementById('user-signout-btn');

  if (!signinBtn) return;

  function update(user) {
    if (user) {
      signinBtn.style.display = 'none';
      chip.style.display      = 'flex';
      if (avatar)  avatar.src            = user.user_metadata?.avatar_url || '';
      if (emailEl) emailEl.textContent   = user.email || user.user_metadata?.full_name || '';
    } else {
      signinBtn.style.display = 'block';
      chip.style.display      = 'none';
    }
  }

  if (window.Auth) {
    window.Auth.onAuthStateChange((_event, session) => update(session?.user ?? null));
    signinBtn.addEventListener('click', () => {
      sessionStorage.setItem('dermai_redirect', '/dashboard.html');
      window.Auth.signInWithGoogle();
    });
    signoutBtn && signoutBtn.addEventListener('click', () => window.Auth.signOut());
  } else {
    signinBtn.addEventListener('click', () => alert('Auth not configured.'));
  }
}
