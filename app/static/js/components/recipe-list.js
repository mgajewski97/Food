import { t, state, parseTimeToMinutes, timeToBucket, toggleFavorite } from '../helpers.js';
import { openRecipeDetails } from './recipe-detail.js';

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
  data.forEach(r => {
    const li = document.createElement('li');
    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost btn-xs mr-2';
    favBtn.innerHTML = state.favoriteRecipes.has(r.name)
      ? '<i class="fa-solid fa-heart"></i>'
      : '<i class="fa-regular fa-heart"></i>';
    favBtn.addEventListener('click', e => {
      e.preventDefault();
      toggleFavorite(r.name);
      renderRecipes();
    });
    const title = document.createElement('span');
    title.textContent = `${r.name} (${r.ingredients.join(', ')})`;
    title.className = 'cursor-pointer';
    title.addEventListener('click', () => openRecipeDetails(r));
    li.appendChild(favBtn);
    li.appendChild(title);
    list.appendChild(li);
  });
}

export async function loadRecipes() {
  const res = await fetch('/api/recipes');
  const data = await res.json();
  data.forEach(r => {
    r.timeBucket = timeToBucket(r.time);
  });
  state.recipesData = data;
  renderRecipes();
}
