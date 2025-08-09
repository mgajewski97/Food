import { state } from '../helpers.js';

function t(key){ return window.t?.(key) ?? key; }

export function renderRecipeDetail(r){
  const favIcon = state.favoriteRecipes.has(r.name)
    ? '<i class="fa-solid fa-heart"></i>'
    : '<i class="fa-regular fa-heart"></i>';

  const header = `
    <div class="flex items-start justify-between mb-4">
      <h3 class="text-xl font-bold">${t(r.name)}</h3>
      <span class="text-lg">${favIcon}</span>
    </div>
  `;
  const ing = (r.ingredients||[]).map(i=>{
    const nameTr = window.t?.(i.product);
    const name = nameTr && nameTr.trim() !== '' ? nameTr : i.product;
    const qty  = (i.quantity ?? '').toString();
    const unit = t(i.unit ?? '');
    const qtyStr = [qty, unit].filter(Boolean).join(' ');
    return `<li class="ingredient-item grid grid-cols-[1fr_auto] gap-4 items-center bg-base-200/40 rounded px-2 py-1">
      <span class="ingredient-name">${name}</span>
      <span class="ingredient-qty text-right">${qtyStr}</span>
    </li>`;
  }).join('');

  const steps = (r.steps||[]).map((s,idx)=>`
    <li class="step-item flex gap-2 p-3 bg-base-200/40 rounded">
      <span class="font-bold">${idx+1}.</span>
      <span>${s}</span>
    </li>
  `).join('');

  return `
    ${header}
    <div class="space-y-6">
      <section>
        <h4 class="font-semibold mb-2">${t('recipe_ingredients_header')}</h4>
        <ul class="ingredient-list space-y-1">${ing}</ul>
      </section>
      <section>
        <h4 class="font-semibold mb-2">${t('recipe_steps_header')}</h4>
        <ol class="step-list space-y-3">${steps}</ol>
      </section>
    </div>
  `;
}
