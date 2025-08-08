import {
  t,
  state,
  parseTimeToMinutes,
  timeToBucket,
  toggleFavorite,
  normalizeRecipe
} from '../helpers.js';
import { showNotification } from './toast.js';

// CHANGELOG:
// - Exposed ``loadRecipes`` without internal catch to allow caller-side retry/toast handling.
// - Added defensive rendering and normalization of ingredient structures.
// - Inline recipe details with expandable cards and single-shot event bindings.

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
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = t(r.name);
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
    header.appendChild(title);
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
    btn.className = 'btn btn-sm btn-primary self-start';
    btn.textContent = t('history_show_details');
    const details = document.createElement('div');
    details.className = 'hidden mt-4 space-y-4';
    const ingHeader = document.createElement('h4');
    ingHeader.className = 'font-semibold';
    ingHeader.textContent = t('recipe_ingredients_header');
    details.appendChild(ingHeader);
    const ingGrid = document.createElement('div');
    ingGrid.className = 'space-y-1 text-sm';
    (r.ingredients || []).forEach(ing => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-2 gap-2';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = t(ing.product);
      const qtySpan = document.createElement('span');
      let qt = '';
      if (ing.quantity != null) {
        qt += String(ing.quantity);
        if (ing.unit) qt += ' ' + t(ing.unit);
      }
      qtySpan.textContent = qt;
      row.appendChild(nameSpan);
      row.appendChild(qtySpan);
      ingGrid.appendChild(row);
    });
    details.appendChild(ingGrid);
    const stepsHeader = document.createElement('h4');
    stepsHeader.className = 'font-semibold';
    stepsHeader.textContent = t('recipe_steps_header');
    details.appendChild(stepsHeader);
    const stepsList = document.createElement('ol');
    stepsList.className = 'list-decimal pl-4 space-y-1 text-sm';
    (r.steps || []).forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      stepsList.appendChild(li);
    });
    details.appendChild(stepsList);
    btn.addEventListener('click', () => details.classList.toggle('hidden'));
    body.appendChild(btn);
    body.appendChild(details);
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
    const res = await fetch('/api/recipes');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const processed = data
      .map(r => normalizeRecipe(r))
      .map(r => ({ ...r, timeBucket: timeToBucket(r.time) }));
    state.recipesData = processed;
    state.recipesLoaded = true;
    renderRecipes();
    return processed;
  } catch (err) {
    showNotification({ type: 'error', title: t('recipes_load_failed'), message: err.message, retry: loadRecipes });
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
