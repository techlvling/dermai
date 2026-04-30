// Server-error toast — shows a small bottom-of-screen banner whenever
// Storage.serverPost / serverGet / serverDelete records a failure. Stops
// us from silently losing data (the symptom of the month-long Vercel
// env-var misconfiguration that caused every /api/scans request to 500).
//
// Throttled per endpoint+status pair so a flapping route doesn't spam.
(function () {
  const seen = new Map(); // key -> last shown timestamp
  const COOLDOWN_MS = 30 * 1000;

  function show(detail) {
    const key = `${detail.method} ${detail.endpoint} ${detail.status}`;
    const now = Date.now();
    const last = seen.get(key) || 0;
    if (now - last < COOLDOWN_MS) return;
    seen.set(key, now);

    let host = document.getElementById('dermai-server-error-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dermai-server-error-toast';
      host.style.cssText = 'position:fixed; left:50%; bottom:1rem; transform:translateX(-50%); z-index:9999; max-width:90vw; padding:0.75rem 1rem; background:#fde7ed; border:1px solid #f5588e; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.15); font:600 0.78rem/1.4 system-ui, sans-serif; color:#a01640; display:flex; gap:0.6rem; align-items:flex-start; cursor:pointer;';
      host.title = 'Click to dismiss';
      host.addEventListener('click', () => host.remove());
      document.body.appendChild(host);
    }

    const summary =
      detail.status === 0
        ? 'Network error — check your connection'
        : detail.status === 401
        ? 'You\'re signed out. Reload to sign back in.'
        : detail.status === 500
        ? 'Server is misconfigured — saves aren\'t working. (Owner: check Vercel env vars.)'
        : `Server returned ${detail.status}`;

    host.innerHTML = `
      <span style="font-size:1rem; line-height:1;">⚠</span>
      <div style="flex:1; min-width:0;">
        <div>${summary}</div>
        <div style="font-weight:400; opacity:0.8; font-size:0.7rem; margin-top:0.15rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${detail.method} ${detail.endpoint}</div>
      </div>
      <span style="font-size:0.7rem; opacity:0.5;">×</span>
    `;
    setTimeout(() => { if (host.parentNode) host.remove(); }, 8000);
  }

  window.addEventListener('dermai:server-error', e => {
    if (e?.detail) show(e.detail);
  });
})();
