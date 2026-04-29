// Scroll-reveal via IntersectionObserver
(async function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Immediately show all reveals if reduced-motion is on
  if (prefersReduced) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  // Scroll reveal
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Fetch real ingredient counts and update stat tiles before count-up runs.
  // Falls back to hardcoded data-count values on any error or timeout.
  async function fetchHeroStats() {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('/api/ingredients', { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      const ingredients = Array.isArray(data) ? data : (data.ingredients || []);
      if (ingredients.length === 0) return;
      const rctTotal = ingredients.reduce(
        (n, i) => n + (Array.isArray(i.keyStudies) ? i.keyStudies.length : 0), 0
      );
      const setStat = (key, value) => {
        const el = document.querySelector(`[data-stat="${key}"]`);
        if (!el || !Number.isFinite(value) || value <= 0) return;
        el.dataset.count = String(value);
        el.textContent = String(value);
      };
      setStat('ingredients', ingredients.length);
      setStat('rcts', rctTotal);
    } catch (_) { /* keep hardcoded fallback values */ }
  }

  await fetchHeroStats();

  // Count-up animation for stat tiles
  function animateCount(el, target, duration) {
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        if (!isNaN(target)) animateCount(el, target, 1400);
        countObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));

  // Scroll-spy: highlight matching nav link as sections enter view
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if (navLinks.length) {
    const sectionMap = new Map();
    navLinks.forEach(link => {
      const sec = document.getElementById(link.getAttribute('href').slice(1));
      if (sec) sectionMap.set(sec, link);
    });
    if (sectionMap.size) {
      const spyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const link = sectionMap.get(entry.target);
          if (link) link.classList.toggle('active', entry.isIntersecting);
        });
      }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
      sectionMap.forEach((_, sec) => spyObserver.observe(sec));
    }
  }
})();
