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
  async function serverGet(endpoint) {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
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
      return res.ok ? res.json() : null;
    } catch { return null; }
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
      return res.ok;
    } catch { return false; }
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
  };
})();
