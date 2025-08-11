import {
  t,
  state,
  parseTimeToMinutes,
  timeToBucket,
  toggleFavorite,
  fetchJson,
  debounce,
  getProduct
} from '../helpers.js';
import { toast } from './toast.js';
import { openRecipeDetails } from './recipe-detail.js';

// CHANGELOG:
// - Exposed ``loadRecipes`` without internal catch to allow caller-side retry/toast handling.
// - Added defensive rendering and normalization of ingredient structures.
// - Inline recipe details with expandable cards and single-shot event bindings.


export function renderRecipes() {
  const list = document.getElementById('recipe-list');
  if (!list) return;
  let data = (state.domain.recipes || []).slice();
  if (state.recipeTimeFilter) data = data.filter(r => r.timeBucket === state.recipeTimeFilter);
  if (state.recipePortionsFilter) {
    if (state.recipePortionsFilter === '5+') {
      data = data.filter(r => (r.servings || 0) >= 5);
    } else {
      data = data.filter(r => String(r.servings) === state.recipePortionsFilter);
    }
  }
  if (state.showFavoritesOnly) data = data.filter(r => state.favoriteRecipes.has(r.id));
  data.sort((a, b) => {
    if (state.recipeSortField === 'time') {
      const ta = parseTimeToMinutes(a.time);
      const tb = parseTimeToMinutes(b.time);
      const taVal = ta == null ? Infinity : ta;
      const tbVal = tb == null ? Infinity : tb;
      return state.recipeSortDir === 'asc' ? taVal - tbVal : tbVal - taVal;
    }
    if (state.recipeSortField === 'portions') {
      const pa = a.servings == null ? Infinity : a.servings;
      const pb = b.servings == null ? Infinity : b.servings;
      return state.recipeSortDir === 'asc' ? pa - pb : pb - pa;
    }
    const an = a.names?.[state.currentLang] || a.names?.en || a.id;
    const bn = b.names?.[state.currentLang] || b.names?.en || b.id;
    return an.localeCompare(bn);
  });
  const frag = document.createDocumentFragment();
  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card bg-base-200 shadow';
    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = t('recipes_empty_state');
    empty.appendChild(body);
    frag.appendChild(empty);
  } else {
    data.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card bg-base-200 shadow';
      const body = document.createElement('div');
      body.className = 'card-body';
      const header = document.createElement('div');
      header.className = 'flex justify-between items-start';
      const titleWrap = document.createElement('div');
      titleWrap.className = 'flex items-center gap-2';
      const title = document.createElement('h3');
      title.className = 'card-title';
      const nameStr = r.names?.[state.currentLang] || r.names?.en || r.id;
      title.textContent = nameStr;
      titleWrap.appendChild(title);
      if (r.available) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-sm badge-outline';
        badge.textContent = t('recipe_available');
        titleWrap.appendChild(badge);
      }
      const favBtn = document.createElement('button');
      favBtn.className = 'btn btn-ghost btn-xs';
      favBtn.innerHTML = state.favoriteRecipes.has(r.id)
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';
      favBtn.addEventListener('click', async e => {
        e.preventDefault();
        favBtn.disabled = true;
        const prev = favBtn.innerHTML;
        favBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
          await toggleFavorite(r.id);
          favBtn.innerHTML = state.favoriteRecipes.has(r.id)
            ? '<i class="fa-solid fa-heart"></i>'
            : '<i class="fa-regular fa-heart"></i>';
          if (state.showFavoritesOnly && !state.favoriteRecipes.has(r.id)) {
            card.remove();
          }
        } catch (err) {
          favBtn.innerHTML = prev;
          toast.error(t('notify_error_title'), err.message);
        } finally {
          favBtn.disabled = false;
        }
      });
      header.appendChild(titleWrap);
      header.appendChild(favBtn);
      body.appendChild(header);
      const meta = document.createElement('div');
      meta.className = 'flex justify-between items-center text-sm';
      if (r.time) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'flex items-center gap-1';
        timeDiv.innerHTML = '<i class="fa-regular fa-clock"></i>';
        const span = document.createElement('span');
        span.textContent = r.time;
        timeDiv.appendChild(span);
        meta.appendChild(timeDiv);
      }
      if (r.servings != null) {
        const portionsDiv = document.createElement('div');
        portionsDiv.className = 'flex items-center gap-1';
        portionsDiv.innerHTML = '<i class="fa-solid fa-users"></i>';
        const span = document.createElement('span');
        span.textContent = String(r.servings);
        portionsDiv.appendChild(span);
        meta.appendChild(portionsDiv);
      }
      if (meta.children.length) body.appendChild(meta);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = t('recipe_show_details');
      btn.addEventListener('click', () => openRecipeDetails(r));
      body.appendChild(btn);
      card.appendChild(body);
      frag.appendChild(card);
    });
  }
  requestAnimationFrame(() => {
    list.innerHTML = '';
    list.appendChild(frag);
  });
}

export async function loadRecipes() {
  if (state.recipesLoaded || state.recipesLoading) return state.domain.recipes;
  const panel = document.getElementById('tab-recipes');
  if (panel && panel.style.display === 'none') {
    if (!state.recipesLoadQueued) {
      const tab = document.querySelector('[data-tab-target="tab-recipes"]');
      tab?.addEventListener('click', () => loadRecipes(), { once: true });
      state.recipesLoadQueued = true;
    }
    return state.domain.recipes;
  }
  state.recipesLoading = true;
  try {
    const locale = state.currentLang || 'pl';
    const data = await fetchJson(`/api/recipes?locale=${locale}`);
    const processed = data.map(r => ({
      ...r,
      timeBucket: timeToBucket(r.time),
      available: (r.ingredients || []).every(i => getProduct(i.productId))
    }));
    state.domain.recipes = processed;
    state.recipesData = processed;
    state.recipesLoaded = true;
    renderRecipes();
    return processed;
  } catch (err) {
    toast.error(t('recipes_load_failed'), err.status || err.message, {
      label: t('retry'),
      onClick: loadRecipes
    });
    return [];
  } finally {
    state.recipesLoading = false;
  }
}

export function bindRecipeEvents() {
  document.addEventListener('favorites-changed', () => {
    renderRecipes();
  });

  const sortField = document.getElementById('recipe-sort-field');
  const sortAsc = document.getElementById('recipe-sort-dir-asc');
  const sortDesc = document.getElementById('recipe-sort-dir-desc');
  const sortMobile = document.getElementById('recipe-sort-mobile');
  const timeFilter = document.getElementById('recipe-time-filter');
  const portionsFilter = document.getElementById('recipe-portions-filter');
  const favToggle = document.getElementById('recipe-favorites-toggle');
  const clearBtn = document.getElementById('recipe-clear-filters');

  function updateSortButtons() {
    sortAsc?.classList.toggle('btn-primary', state.recipeSortDir === 'asc');
    sortAsc?.classList.toggle('btn-outline', state.recipeSortDir !== 'asc');
    sortDesc?.classList.toggle('btn-primary', state.recipeSortDir === 'desc');
    sortDesc?.classList.toggle('btn-outline', state.recipeSortDir !== 'desc');
  }

  sortField?.addEventListener('change', debounce(() => {
    state.recipeSortField = sortField.value;
    renderRecipes();
  }, 150));
  sortAsc?.addEventListener('click', () => {
    state.recipeSortDir = 'asc';
    updateSortButtons();
    renderRecipes();
  });
  sortDesc?.addEventListener('click', () => {
    state.recipeSortDir = 'desc';
    updateSortButtons();
    renderRecipes();
  });
  sortMobile?.addEventListener('change', debounce(() => {
    const [field, dir] = sortMobile.value.split('-');
    state.recipeSortField = field;
    state.recipeSortDir = dir;
    updateSortButtons();
    renderRecipes();
  }, 150));

  timeFilter?.addEventListener('change', debounce(() => {
    state.recipeTimeFilter = timeFilter.value;
    renderRecipes();
  }, 150));
  portionsFilter?.addEventListener('change', debounce(() => {
    state.recipePortionsFilter = portionsFilter.value;
    renderRecipes();
  }, 150));
  favToggle?.addEventListener('click', () => {
    state.showFavoritesOnly = !state.showFavoritesOnly;
    favToggle.classList.toggle('btn-primary', state.showFavoritesOnly);
    favToggle.classList.toggle('btn-outline', !state.showFavoritesOnly);
    renderRecipes();
  });
  clearBtn?.addEventListener('click', () => {
    state.recipeSortField = 'name';
    state.recipeSortDir = 'asc';
    state.recipeTimeFilter = '';
    state.recipePortionsFilter = '';
    state.showFavoritesOnly = false;
    sortField && (sortField.value = 'name');
    sortMobile && (sortMobile.value = 'name-asc');
    timeFilter && (timeFilter.value = '');
    portionsFilter && (portionsFilter.value = '');
    favToggle?.classList.remove('btn-primary');
    favToggle?.classList.add('btn-outline');
    updateSortButtons();
    renderRecipes();
  });

  updateSortButtons();
}

// Render recipe list once the domain data is ready.
if (window.__domain) {
  renderRecipes();
} else {
  document.addEventListener(
    'domain:ready',
    () => {
      renderRecipes();
    },
    { once: true }
  );
}
