import { t, state, parseTimeToMinutes, timeToBucket, toggleFavorite } from '../helpers.js';
import { openRecipeDetails } from './recipe-detail.js';

// CHANGELOG:
// - Exposed ``loadRecipes`` without internal catch to allow caller-side retry/toast handling.
// - Added defensive rendering and normalization of ingredient structures.

export function renderRecipes() {
  const list = document.getElementById('recipe-list');
  if (!list) return;
  list.innerHTML = '';
  let data = state.recipesData.slice();
  if (state.recipeTimeFilter) data = data.filter(r => r.timeBucket === state.recipeTimeFilter);
  if (state.recipePortionsFilter) data = data.filter(r => String(r.portions) === state.recipePortionsFilter);
  if (state.showFavoritesOnly) data = data.filter(r => state.favoriteRecipes.has(r.name));
  data.sort((a, b) => {
    if (state.recipeSortField === 'time') {
      const ta = parseTimeToMinutes(a.time) || 0;
      const tb = parseTimeToMinutes(b.time) || 0;
      return state.recipeSortDir === 'asc' ? ta - tb : tb - ta;
    }
    if (state.recipeSortField === 'portions') {
      const pa = a.portions || 0;
      const pb = b.portions || 0;
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
    meta.className = 'flex items-center gap-4 text-sm';
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
    btn.addEventListener('click', () => openRecipeDetails(r));
    body.appendChild(btn);
    card.appendChild(body);
    list.appendChild(card);
  });
}

export async function loadRecipes() {
  const res = await fetch('/api/recipes');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const processed = [];
  data.forEach(r => {
    try {
      if (!r || !r.name || !Array.isArray(r.ingredients)) throw new Error('invalid structure');
      const ingredients = r.ingredients.map(ing => {
        if (typeof ing === 'string') {
          return { productKey: ing, quantity: null, unit: null };
        }
        if (ing && typeof ing === 'object' && typeof ing.product === 'string') {
          return {
            productKey: ing.product,
            quantity: ing.quantity != null ? ing.quantity : null,
            unit: ing.unit || null
          };
        }
        throw new Error('invalid ingredient');
      });
      processed.push({
        ...r,
        ingredients,
        timeBucket: timeToBucket(r.time)
      });
    } catch (err) {
      console.warn(`Skipping recipe ${r && r.name ? r.name : '(unknown)'}`, err.message);
    }
  });
  state.recipesData = processed;
  renderRecipes();
  return processed;
}
