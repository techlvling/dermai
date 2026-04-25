document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('ingredients-grid');
  const searchInput = document.getElementById('search-input');
  const loadingIndicator = document.getElementById('loading-indicator');

  let ingredientsData = [];
  let concernsMap = {};
  let activeFilter = 'All';

  const filterDefs = [
    { label: 'All', concerns: null },
    { label: 'Acne', concerns: ['Acne'] },
    { label: 'Pigmentation', concerns: ['Hyperpigmentation'] },
    { label: 'Aging', concerns: ['Fine Lines', 'Texture'] },
    { label: 'Dryness', concerns: ['Dryness', 'Sensitivity'] },
    { label: 'Pores & Oil', concerns: ['Pores', 'Oiliness'] }
  ];

  // Build filter chip bar
  const chipsContainer = document.createElement('div');
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

  // Insert chips after the search bar
  const searchBar = document.querySelector('.search-bar');
  searchBar.insertAdjacentElement('afterend', chipsContainer);

  function getFilteredIngredients() {
    const def = filterDefs.find(d => d.label === activeFilter);
    const term = searchInput.value.toLowerCase();

    return ingredientsData.filter(ing => {
      // Concern filter
      if (def && def.concerns) {
        const targetIds = def.concerns.flatMap(c => (concernsMap[c] && concernsMap[c].targetIngredients) || []);
        if (!targetIds.includes(ing.id)) return false;
      }
      // Text search
      if (term) {
        return ing.name.toLowerCase().includes(term) ||
          (ing.keyStudies && ing.keyStudies.some(s => s.title.toLowerCase().includes(term)));
      }
      return true;
    });
  }

  function applyFilters() {
    renderGrid(getFilteredIngredients());
  }

  async function fetchData() {
    loadingIndicator.classList.remove('hidden');
    try {
      const [ingRes, conRes] = await Promise.all([
        fetch('/api/ingredients'),
        fetch('/api/concerns')
      ]);
      if (!ingRes.ok) throw new Error('Failed to load ingredients');
      ingredientsData = await ingRes.json();
      if (conRes.ok) concernsMap = await conRes.json();
      renderGrid(ingredientsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      grid.innerHTML = '<div class="text-center" style="grid-column: 1 / -1;"><p class="error">Failed to load PubMed database. Is the backend running?</p></div>';
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function renderGrid(data) {
    grid.innerHTML = '';
    if (data.length === 0) {
      grid.innerHTML = '<div class="text-center" style="grid-column: 1 / -1;"><p>No ingredients found matching your search.</p></div>';
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
              <a href="${study.link}" target="_blank" rel="noopener noreferrer" class="study-link">
                "${study.title}"
              </a>
              <div class="study-meta">
                ${study.journal} (${study.year}) | ${study.authors}
              </div>
            </div>`;
        });
      } else {
        studiesHTML = '<p class="study-meta">No PubMed studies currently indexed.</p>';
      }

      // Which concerns this ingredient targets
      const targetedConcerns = Object.entries(concernsMap)
        .filter(([, val]) => val.targetIngredients.includes(ingredient.id))
        .map(([key]) => key);

      const concernTagsHTML = targetedConcerns.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.75rem;">
            ${targetedConcerns.map(c => `<span style="font-size:0.7rem; padding:0.2rem 0.6rem; border-radius:999px; background:rgba(245,88,142,0.10); color:var(--primary-700); border:1px solid rgba(245,88,142,0.20);">${c}</span>`).join('')}
          </div>`
        : '';

      card.innerHTML = `
        <div class="ingredient-header">
          <div>
            <h2 class="ingredient-name">${ingredient.name}</h2>
            <span class="evidence-label">${ingredient.evidenceType}</span>
            ${concernTagsHTML}
          </div>
          <span class="badge badge-tier-${ingredient.evidenceTier}">
            ${ingredient.evidenceTier === 1 ? '🏆 Tier 1 RCT' : '✅ Tier 2'}
          </span>
        </div>
        <div class="studies-section">
          <div class="studies-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Key PubMed Studies
          </div>
          ${studiesHTML}
        </div>`;
      grid.appendChild(card);
    });
  }

  searchInput.addEventListener('input', applyFilters);

  fetchData();
});
