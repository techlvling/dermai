window.Ingredients = (function () {
  let _mounted = false;

  function _init() {
    const grid             = document.getElementById('ingredients-grid');
    const searchInput      = document.getElementById('search-input');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (!grid || !searchInput) return;

    let ingredientsData    = [];
    let concernsMap        = {};
    let functionTagsData   = {};
    let activeFilter       = 'All';
    let activeFnFilter     = 'All';

    const filterDefs = [
      { label: 'All',          concerns: null },
      { label: 'Acne',         concerns: ['Acne'] },
      { label: 'Pigmentation', concerns: ['Hyperpigmentation'] },
      { label: 'Aging',        concerns: ['Fine Lines', 'Texture'] },
      { label: 'Dryness',      concerns: ['Dryness', 'Sensitivity'] },
      { label: 'Pores & Oil',  concerns: ['Pores', 'Oiliness'] }
    ];

    // Build filter chip bar (insert after search bar)
    let chipsContainer = document.getElementById('filter-chips');
    if (!chipsContainer) {
      chipsContainer = document.createElement('div');
      chipsContainer.id = 'filter-chips';
      chipsContainer.className = 'filter-chips';
      filterDefs.forEach(def => {
        const chip = document.createElement('button');
        chip.className = 'filter-chip' + (def.label === 'All' ? ' active' : '');
        chip.textContent = def.label;
        chip.dataset.filter = def.label;
        chip.addEventListener('click', () => {
          activeFilter = def.label;
          document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          applyFilters();
        });
        chipsContainer.appendChild(chip);
      });
      const searchBar = document.querySelector('.search-bar');
      if (searchBar) searchBar.insertAdjacentElement('afterend', chipsContainer);
      else grid.parentNode.insertBefore(chipsContainer, grid);
    }

    function _buildFnChips() {
      if (document.getElementById('function-filter-chips')) return;
      const keys = Object.keys(functionTagsData);
      if (!keys.length) return;
      const fnContainer = document.createElement('div');
      fnContainer.id = 'function-filter-chips';
      fnContainer.className = 'filter-chips filter-chips--functions';

      const allBtn = document.createElement('button');
      allBtn.className = 'function-chip-filter active';
      allBtn.textContent = 'All functions';
      allBtn.dataset.fn = 'All';
      allBtn.addEventListener('click', () => {
        activeFnFilter = 'All';
        fnContainer.querySelectorAll('.function-chip-filter').forEach(c => c.classList.remove('active'));
        allBtn.classList.add('active');
        applyFilters();
      });
      fnContainer.appendChild(allBtn);

      keys.forEach(slug => {
        const meta = functionTagsData[slug];
        const btn  = document.createElement('button');
        btn.className = 'function-chip-filter';
        btn.textContent = meta.label;
        btn.dataset.fn  = slug;
        btn.style.setProperty('--chip-accent', meta.accent);
        btn.addEventListener('click', () => {
          activeFnFilter = slug;
          fnContainer.querySelectorAll('.function-chip-filter').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          applyFilters();
        });
        fnContainer.appendChild(btn);
      });

      const concernsRow = document.getElementById('filter-chips');
      if (concernsRow) concernsRow.insertAdjacentElement('afterend', fnContainer);
      else grid.parentNode.insertBefore(fnContainer, grid);
    }

    function getFilteredIngredients() {
      const def  = filterDefs.find(d => d.label === activeFilter);
      const term = searchInput.value.toLowerCase();
      return ingredientsData.filter(ing => {
        if (def && def.concerns) {
          const targetIds = def.concerns.flatMap(c => (concernsMap[c] && concernsMap[c].targetIngredients) || []);
          if (!targetIds.includes(ing.id)) return false;
        }
        if (activeFnFilter !== 'All') {
          if (!ing.functions || !ing.functions.includes(activeFnFilter)) return false;
        }
        if (term) {
          return ing.name.toLowerCase().includes(term) ||
            (ing.keyStudies && ing.keyStudies.some(s => s.title.toLowerCase().includes(term)));
        }
        return true;
      });
    }

    function applyFilters() { renderGrid(getFilteredIngredients()); }

    async function fetchData() {
      if (loadingIndicator) loadingIndicator.classList.remove('hidden');
      try {
        const [ingRes, conRes, fnRes] = await Promise.all([fetch('/api/ingredients'), fetch('/api/concerns'), fetch('/api/function-tags')]);
        if (!ingRes.ok) throw new Error('Failed to load ingredients');
        ingredientsData  = await ingRes.json();
        if (conRes.ok) concernsMap      = await conRes.json();
        if (fnRes.ok)  functionTagsData = await fnRes.json();
        _buildFnChips();
        renderGrid(ingredientsData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        grid.innerHTML = '<div class="text-center" style="grid-column:1/-1;"><p class="error">Failed to load PubMed database. Is the backend running?</p></div>';
      } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
      }
    }

    function renderGrid(data) {
      grid.innerHTML = '';
      if (data.length === 0) {
        grid.innerHTML = '<div class="text-center" style="grid-column:1/-1;"><p>No ingredients found matching your search.</p></div>';
        return;
      }
      data.forEach(ingredient => {
        const card = document.createElement('div');
        card.className = 'ingredient-card glass-panel';

        let studiesHTML = '';
        if (ingredient.keyStudies && ingredient.keyStudies.length > 0) {
          ingredient.keyStudies.forEach(study => {
            studiesHTML += `
              <div class="study-item">
                <a href="${study.link}" target="_blank" rel="noopener noreferrer" class="study-link">"${study.title}"</a>
                <div class="study-meta">${study.journal} (${study.year}) | ${study.authors}</div>
              </div>`;
          });
        } else {
          studiesHTML = '<p class="study-meta">No PubMed studies currently indexed.</p>';
        }

        const targetedConcerns = Object.entries(concernsMap)
          .filter(([, val]) => val.targetIngredients.includes(ingredient.id))
          .map(([key]) => key);

        const concernTagsHTML = targetedConcerns.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.75rem;">
              ${targetedConcerns.map(c => `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;border-radius:999px;background:rgba(245,88,142,0.10);color:var(--primary-700);border:1px solid rgba(245,88,142,0.20);">${c}</span>`).join('')}
            </div>`
          : '';

        const ratingKey = ingredient.ratingOverride ||
          (ingredient.evidenceTier === 1 ? 'hero' : ingredient.evidenceTier === 2 ? 'solid' : ingredient.evidenceTier === 3 ? 'caution' : 'mid');
        const ratingLabelMap = { hero: '🏆 Hero', solid: '✅ Solid', mid: '💡 Mid', caution: '⚠️ Caution' };
        const fnChipsHTML = (ingredient.functions || []).map(slug => {
          const meta = functionTagsData[slug];
          return meta ? `<span class="function-chip-tag" style="--chip-accent:${meta.accent}" title="${meta.definition}">${meta.label}</span>` : '';
        }).join('');

        card.innerHTML = `
          <div class="ingredient-header">
            <div style="flex:1;min-width:0;">
              <a href="/ingredient/${ingredient.id}" class="ingredient-name-link">
                <h2 class="ingredient-name">${ingredient.name}</h2>
              </a>
              <span class="evidence-label">${ingredient.evidenceType}</span>
              ${concernTagsHTML}
              ${fnChipsHTML ? `<div class="function-chips-row">${fnChipsHTML}</div>` : ''}
            </div>
            <div class="ingredient-badges">
              <span class="badge badge-tier-${ingredient.evidenceTier}">
                ${ingredient.evidenceTier === 1 ? '🏆 Tier 1 RCT' : '✅ Tier 2'}
              </span>
              <span class="rating-badge-card rating-badge-card--${ratingKey}">${ratingLabelMap[ratingKey] || ratingKey}</span>
            </div>
          </div>
          <div class="studies-section">
            <div class="studies-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Key PubMed Studies
            </div>
            ${studiesHTML}
          </div>`;
        grid.appendChild(card);
      });
    }

    searchInput.addEventListener('input', applyFilters);
    fetchData();
  }

  return {
    mount() {
      if (_mounted) return;
      _mounted = true;
      _init();
    }
  };
})();
