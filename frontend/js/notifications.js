const NotifPrefs = (() => {
  const KEY = 'dermAI_notifPrefs';
  const DEFAULTS = {
    enabled: false,        // routine AM/PM reminders master toggle
    amTime: '08:00',
    pmTime: '21:00',
    scanEnabled: false,    // daily-scan reminder toggle (separate from routine)
    scanTime: '20:00',
  };

  function get() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
    } catch { return { ...DEFAULTS }; }
  }

  function set(prefs) { localStorage.setItem(KEY, JSON.stringify(prefs)); }

  function msUntil(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now    = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
  }

  function schedule() {
    const prefs = get();
    if (Notification.permission !== 'granted') return;
    if (prefs.enabled) {
      const bodies = [
        'yo, morning routine. lock in.',
        'night routine ping. ur face will thank u.'
      ];
      [prefs.amTime, prefs.pmTime].forEach((t, i) => {
        setTimeout(() => {
          new Notification('DermAI', { body: bodies[i], icon: '/favicon.ico' });
          schedule();
        }, msUntil(t));
      });
    }
    if (prefs.scanEnabled) {
      setTimeout(() => {
        new Notification('DermAI', { body: 'scan time. cook ☕', icon: '/favicon.ico' });
        schedule();
      }, msUntil(prefs.scanTime));
    }
  }

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    const prefs = get();
    prefs.enabled = true;
    set(prefs);
    schedule();
    return true;
  }

  function disable() {
    const prefs = get();
    prefs.enabled = false;
    set(prefs);
  }

  // Same enable/disable shape, but for the daily-scan reminder. Permission
  // grant is shared (one Notification.requestPermission per browser).
  async function enableScan() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    const prefs = get();
    prefs.scanEnabled = true;
    set(prefs);
    schedule();
    return true;
  }

  function disableScan() {
    const prefs = get();
    prefs.scanEnabled = false;
    set(prefs);
  }

  function init() {
    if (!('Notification' in window)) return;
    const prefs = get();
    if ((prefs.enabled || prefs.scanEnabled) && Notification.permission === 'granted') schedule();
  }

  return { get, set, enable, disable, enableScan, disableScan, schedule, init };
})();

document.addEventListener('DOMContentLoaded', () => NotifPrefs.init());
