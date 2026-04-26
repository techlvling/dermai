const NotifPrefs = (() => {
  const KEY = 'dermAI_notifPrefs';

  function get() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { enabled: false, amTime: '08:00', pmTime: '21:00' };
    } catch { return { enabled: false, amTime: '08:00', pmTime: '21:00' }; }
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
    if (!prefs.enabled || Notification.permission !== 'granted') return;
    const bodies = [
      'Time for your morning skincare routine!',
      'Evening routine reminder — your skin will thank you.'
    ];
    [prefs.amTime, prefs.pmTime].forEach((t, i) => {
      setTimeout(() => {
        new Notification('DermAI', { body: bodies[i], icon: '/favicon.ico' });
        schedule();
      }, msUntil(t));
    });
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

  function init() {
    if (!('Notification' in window)) return;
    const prefs = get();
    if (prefs.enabled && Notification.permission === 'granted') schedule();
  }

  return { get, set, enable, disable, schedule, init };
})();

document.addEventListener('DOMContentLoaded', () => NotifPrefs.init());
