import { state, t } from '../helpers.js';

export function renderRecipeDetail(r) {
  const ing = (r.ingredients || []).map(i => {
    const nameTr = t(i.product);
    const name = nameTr && nameTr.trim() !== '' ? nameTr : i.product;
    const qty = (i.quantity ?? '').toString();
    const unit = t(i.unit ?? '');
    const qtyStr = [qty, unit].filter(Boolean).join(' ');
    if (state.displayMode === 'mobile') {
      const mobileLine = [qtyStr, name].filter(Boolean).join(' – ');
      return `<li class="ingredient-item bg-base-200/40 rounded px-2 py-1">${mobileLine}</li>`;
    }
    return `<li class="ingredient-item grid grid-cols-[1fr_auto] gap-4 items-center bg-base-200/40 rounded px-2 py-1">
      <span class="ingredient-name">${name}</span>
      <span class="ingredient-qty text-right">${qtyStr}</span>
    </li>`;
  }).join('');

  const steps = (r.steps || []).map((s, idx) => `
    <li class="step-item flex gap-2 p-3 bg-base-200/40 rounded">
      <span class="font-bold">${idx + 1}.</span>
      <span>${s}</span>
    </li>
  `).join('');

  return `
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
