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
    }
  };
})();
