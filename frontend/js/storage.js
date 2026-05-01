const Storage = (() => {
  // ── Local storage (unchanged public API) ─────────────────────────
  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // ── Auth helpers ──────────────────────────────────────────────────
  async function getToken() {
    try { return window.Auth ? await window.Auth.getToken() : null; } catch { return null; }
  }

  async function isLoggedIn() {
    try { return window.Auth ? !!(await window.Auth.getUser()) : false; } catch { return false; }
  }

  // ── Server API helpers ────────────────────────────────────────────
  // History: these used to swallow ALL non-2xx responses by returning null.
  // That hid a month-long Vercel env-var misconfiguration that 500'd every
  // authenticated request. Now we capture the status + body and stash the
  // last failure on Storage.lastServerError so callers can surface a banner.
  // Public API (`return null on failure`) is preserved for back-compat.

  let _lastServerError = null;

  function recordError(method, endpoint, status, bodyText) {
    _lastServerError = {
      method, endpoint, status,
      body: (bodyText || '').slice(0, 300),
      at: Date.now(),
    };
    console.warn(`[storage] ${method} ${endpoint} -> ${status}`, bodyText?.slice(0, 200));
    // Fire a custom event so any page can react to recurring failures.
    try { window.dispatchEvent(new CustomEvent('dermai:server-error', { detail: _lastServerError })); }
    catch (_) { /* SSR safety */ }
  }

  async function serverGet(endpoint) {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) return res.json();
      const txt = await res.text().catch(() => '');
      recordError('GET', endpoint, res.status, txt);
      return null;
    } catch (e) {
      recordError('GET', endpoint, 0, e?.message || 'network');
      return null;
    }
  }

  async function serverPost(endpoint, body) {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (res.ok) return res.json();
      const txt = await res.text().catch(() => '');
      recordError('POST', endpoint, res.status, txt);
      return null;
    } catch (e) {
      recordError('POST', endpoint, 0, e?.message || 'network');
      return null;
    }
  }

  // Fetch the most-recent scan from the server. Returns null when:
  //   - user is not logged in
  //   - server returns no rows
  //   - request fails
  // Used by recommendations.js init() so routine page is server-first
  // when logged in instead of trusting potentially-stale localStorage.
  async function fetchLatestScan() {
    if (!(await isLoggedIn())) return null;
    const body = await serverGet('/api/scans');
    const scans = body?.scans;
    if (!Array.isArray(scans) || !scans.length) return null;
    // /api/scans returns newest-first (verified in backend/routes/scans.js)
    const latest = scans[0];
    if (!latest?.result_json) return null;
    return {
      id: latest.id,
      result_json: latest.result_json,
      image_urls: latest.image_urls || null,
      closeup_meta: latest.closeup_meta || null,
      created_at: latest.created_at,
    };
  }

  async function serverDelete(endpoint) {
    const token = await getToken();
    if (!token) return false;
    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) return true;
      const txt = await res.text().catch(() => '');
      recordError('DELETE', endpoint, res.status, txt);
      return false;
    } catch (e) {
      recordError('DELETE', endpoint, 0, e?.message || 'network');
      return false;
    }
  }

  return {
    // Local — same API as before, all existing callers work unchanged
    get,
    set,

    // Auth state
    getToken,
    isLoggedIn,

    // Server API (used by recommendations.js and history.js in Task 6)
    server: {
      get: serverGet,
      post: serverPost,
      delete: serverDelete
    },

    // High-level: server-first scan fetch with auth + empty handling
    fetchLatestScan,

    // Diagnostic: the most recent failed server response (status + body).
    // Pages can read this after a `return null` from server.* to render a
    // user-facing banner with what actually went wrong.
    get lastServerError() { return _lastServerError; },
  };
})();
