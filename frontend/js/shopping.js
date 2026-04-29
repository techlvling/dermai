window.Shopping = (function () {
  let _mounted = false;

  const amazonRegions = {
    US:{tld:'com',tag:''}, CA:{tld:'ca',tag:''}, UK:{tld:'co.uk',tag:''},
    DE:{tld:'de',tag:''}, FR:{tld:'fr',tag:''}, IT:{tld:'it',tag:''},
    ES:{tld:'es',tag:''}, NL:{tld:'nl',tag:''}, SE:{tld:'se',tag:''},
    PL:{tld:'pl',tag:''}, IN:{tld:'in',tag:'tinkref-21'},
    JP:{tld:'co.jp',tag:''}, AU:{tld:'com.au',tag:''}, SG:{tld:'sg',tag:''},
    AE:{tld:'ae',tag:''}, SA:{tld:'sa',tag:''}, MX:{tld:'com.mx',tag:''},
    BR:{tld:'com.br',tag:''}
  };
  const COUNTRY_TO_REGION = {
    US:'US',CA:'CA',GB:'UK',DE:'DE',FR:'FR',IT:'IT',ES:'ES',
    NL:'NL',SE:'SE',PL:'PL',IN:'IN',JP:'JP',AU:'AU',SG:'SG',
    AE:'AE',SA:'SA',MX:'MX',BR:'BR'
  };

  async function _init() {
    const loading  = document.getElementById('shopping-loading');
    const emptyEl  = document.getElementById('shopping-empty');
    const listEl   = document.getElementById('shopping-list');
    const itemsEl  = document.getElementById('shopping-items');

    const favs = Storage.get('dermAI_favorites') || [];

    if (!favs.length) {
      if (loading)  loading.classList.add('hidden');
      if (emptyEl)  emptyEl.classList.remove('hidden');
      return;
    }

    let tld = 'com', tag = '';
    try {
      const geo = await fetch('https://ipapi.co/json/').then(r => r.json());
      const code = (geo.country_code || '').toUpperCase();
      const regionKey = COUNTRY_TO_REGION[code] || 'US';
      tld = amazonRegions[regionKey].tld;
      tag = amazonRegions[regionKey].tag;
    } catch {}

    let products = [];
    try {
      const res = await fetch('/api/products');
      if (res.ok) products = await res.json();
    } catch {}

    if (loading) loading.classList.add('hidden');

    const saved = products.filter(p => favs.includes(p.id));
    if (!saved.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (itemsEl) {
      itemsEl.innerHTML = saved.map(prod => {
        const q = encodeURIComponent(`${prod.brand} ${prod.name}`);
        const buyURL = `https://www.amazon.${tld}/s?k=${q}${tag ? `&tag=${tag}` : ''}`;
        return `
          <div class="shopping-item" data-id="${prod.id}">
            <div class="shopping-item-info">
              <p class="prod-brand">${prod.brand}</p>
              <p class="prod-name">${prod.name}</p>
              <p class="prod-meta"><strong>Treats:</strong> ${prod.concerns.join(', ')}</p>
              <p class="prod-meta"><strong>Best time:</strong> ${prod.bestTimeOfDay || 'Any'}</p>
            </div>
            <div class="shopping-item-actions">
              <a href="${buyURL}" target="_blank" rel="sponsored noopener noreferrer" class="btn buy-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Buy on Amazon
              </a>
              <button class="btn btn-outline" onclick="Shopping.removeItem('${prod.id}', this)"
                      style="margin-top:0.5rem;width:100%;font-size:0.7rem;">Remove</button>
            </div>
          </div>`;
      }).join('');
    }

    if (listEl) listEl.classList.remove('hidden');
  }

  return {
    mount() {
      if (_mounted) return;
      _mounted = true;
      _init();
    },

    removeItem(prodId, btn) {
      const favs = Storage.get('dermAI_favorites') || [];
      const idx  = favs.indexOf(prodId);
      if (idx >= 0) favs.splice(idx, 1);
      Storage.set('dermAI_favorites', favs);
      const item = btn.closest('.shopping-item');
      if (item) item.remove();
      if (!document.querySelectorAll('.shopping-item').length) {
        const listEl  = document.getElementById('shopping-list');
        const emptyEl = document.getElementById('shopping-empty');
        if (listEl)  listEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
      }
    },

    copyList() {
      const items = Array.from(document.querySelectorAll('.shopping-item'));
      const text  = 'My DermAI Shopping List:\n\n' + items.map(el => {
        const brand = el.querySelector('.prod-brand').textContent.trim();
        const name  = el.querySelector('.prod-name').textContent.trim();
        return `• ${brand} — ${name}`;
      }).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const btn  = document.getElementById('copy-list-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }).catch(() => alert('Copy failed — please copy manually.'));
    }
  };
})();
