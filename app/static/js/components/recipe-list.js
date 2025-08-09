import {
  t,
  state,
  parseTimeToMinutes,
  timeToBucket,
  toggleFavorite,
  normalizeRecipe,
  fetchJson
} from '../helpers.js';
import { toast } from './toast.js';
import { renderRecipeDetail } from './recipe-detail.js';

// CHANGELOG:
// - Exposed ``loadRecipes`` without internal catch to allow caller-side retry/toast handling.
// - Added defensive rendering and normalization of ingredient structures.
// - Inline recipe details with expandable cards and single-shot event bindings.

function getRecipeById(id) {
  return state.recipesData.find(r => r.name === id);
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('.show-recipe');
  if (!btn) return;
  const id = btn.dataset.recipeId;
  const panel = document.getElementById(`recipe-detail-${id}`);
  if (!panel) return;
  const open = panel.classList.toggle('hidden') === false;
  btn.textContent = open ? t('recipe_hide_details') : t('recipe_show_details');
  if (open && !panel.dataset.hydrated) {
    const recipe = getRecipeById(id);
    panel.innerHTML = renderRecipeDetail(recipe);
    panel.dataset.hydrated = '1';
  }
});

export function renderRecipes() {
  const list = document.getElementById('recipe-list');
  if (!list) return;
  list.innerHTML = '';
  let data = state.recipesData.slice();
  if (state.recipeTimeFilter) data = data.filter(r => r.timeBucket === state.recipeTimeFilter);
  if (state.recipePortionsFilter) {
    if (state.recipePortionsFilter === '5+') {
      data = data.filter(r => (r.portions || 0) >= 5);
    } else {
      data = data.filter(r => String(r.portions) === state.recipePortionsFilter);
    }
  }
  if (state.showFavoritesOnly) data = data.filter(r => state.favoriteRecipes.has(r.name));
  data.sort((a, b) => {
    if (state.recipeSortField === 'time') {
      const ta = parseTimeToMinutes(a.time);
      const tb = parseTimeToMinutes(b.time);
      const taVal = ta == null ? Infinity : ta;
      const tbVal = tb == null ? Infinity : tb;
      return state.recipeSortDir === 'asc' ? taVal - tbVal : tbVal - taVal;
    }
    if (state.recipeSortField === 'portions') {
      const pa = a.portions == null ? Infinity : a.portions;
      const pb = b.portions == null ? Infinity : b.portions;
      return state.recipeSortDir === 'asc' ? pa - pb : pb - pa;
    }
    return a.name.localeCompare(b.name);
  });
  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card bg-base-200 shadow';
    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = t('recipes_empty_state');
    empty.appendChild(body);
    list.appendChild(empty);
    return;
  }
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
    const nameTr = t(r.name);
    title.textContent = nameTr && nameTr.trim() !== '' ? nameTr : r.name;
    titleWrap.appendChild(title);
    if (r.available) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-sm badge-outline';
      badge.textContent = t('recipe_available');
      titleWrap.appendChild(badge);
    }
    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost btn-xs';
    favBtn.innerHTML = state.favoriteRecipes.has(r.name)
      ? '<i class="fa-solid fa-heart"></i>'
      : '<i class="fa-regular fa-heart"></i>';
    favBtn.addEventListener('click', e => {
      e.preventDefault();
      toggleFavorite(r.name);
      renderRecipes();
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
    if (r.portions != null) {
      const portionsDiv = document.createElement('div');
      portionsDiv.className = 'flex items-center gap-1';
      portionsDiv.innerHTML = '<i class="fa-solid fa-users"></i>';
      const span = document.createElement('span');
      span.textContent = String(r.portions);
      portionsDiv.appendChild(span);
      meta.appendChild(portionsDiv);
    }
    if (meta.children.length) body.appendChild(meta);
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary show-recipe';
    btn.dataset.recipeId = r.name;
    btn.textContent = t('recipe_show_details');
    const panel = document.createElement('div');
    panel.id = `recipe-detail-${r.name}`;
    panel.className = 'recipe-detail hidden';
    body.appendChild(btn);
    body.appendChild(panel);
    card.appendChild(body);
    list.appendChild(card);
  });
}

export async function loadRecipes() {
  if (state.recipesLoaded || state.recipesLoading) return state.recipesData;
  const panel = document.getElementById('tab-recipes');
  if (panel && panel.style.display === 'none') {
    if (!state.recipesLoadQueued) {
      const tab = document.querySelector('[data-tab-target="tab-recipes"]');
      tab?.addEventListener('click', () => loadRecipes(), { once: true });
      state.recipesLoadQueued = true;
    }
    return state.recipesData;
  }
  state.recipesLoading = true;
  try {
    const data = await fetchJson('/api/recipes');
    const processed = data
      .map(r => normalizeRecipe(r))
      .map(r => ({
        ...r,
        timeBucket: timeToBucket(r.time),
        available: (r.ingredients || []).every(i => state.translations.products[i.product])
      }));
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

document.addEventListener('DOMContentLoaded', () => {
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

  sortField?.addEventListener('change', () => {
    state.recipeSortField = sortField.value;
    renderRecipes();
  });
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
  sortMobile?.addEventListener('change', () => {
    const [field, dir] = sortMobile.value.split('-');
    state.recipeSortField = field;
    state.recipeSortDir = dir;
    updateSortButtons();
    renderRecipes();
  });

  timeFilter?.addEventListener('change', () => {
    state.recipeTimeFilter = timeFilter.value;
    renderRecipes();
  });
  portionsFilter?.addEventListener('change', () => {
    state.recipePortionsFilter = portionsFilter.value;
    renderRecipes();
  });
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
});
