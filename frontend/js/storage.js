const Storage = (() => ({
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
}))();
