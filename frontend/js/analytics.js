(function () {
  var _isProd = !/^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(location.hostname);
  var SUPABASE_URL = 'https://kqinywnsotyssdciciuf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaW55d25zb3R5c3NkY2ljaXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzg5NTksImV4cCI6MjA5Mjk1NDk1OX0.vG8fTQW5KuZBb0QNjfz-LymVwVmn_Z3sXX6iRdMKc_w';

  window.track = function (eventName, props) {
    if (_isProd) {
      if (window.va) window.va('event', Object.assign({ name: eventName }, props || {}));
    } else {
      console.log('[analytics]', eventName, props || {});
    }
  };

  window.mountOnlineCounter = function (elementId) {
    var el = document.getElementById(elementId);
    if (!el || !window.supabase) return;
    var clientId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    var anon = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    var channel = anon.channel('tinkskin:online', { config: { presence: { key: clientId } } });

    function refresh() {
      var count = Object.keys(channel.presenceState()).length;
      if (count >= 3) {
        el.textContent = count + ' scanning rn';
        el.style.display = 'inline-flex';
        el.classList.remove('hidden');
      } else {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    }

    channel
      .on('presence', { event: 'sync' }, refresh)
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          channel.track({ t: Date.now() });
          refresh();
        }
      });
  };
}());
