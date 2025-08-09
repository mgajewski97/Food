import { state, t, toggleFavorite } from '../helpers.js';

function renderRecipeDetail(r) {
  const nameTr = t(r.name);
  const title = nameTr && nameTr.trim() !== '' ? nameTr : r.name;

  const meta = [];
  if (r.time) {
    meta.push(`<div class="flex items-center gap-1"><i class="fa-regular fa-clock"></i><span>${r.time}</span></div>`);
  }
  if (r.portions != null) {
    meta.push(`<div class="flex items-center gap-1"><i class="fa-solid fa-users"></i><span>${r.portions}</span></div>`);
  }
  const metaHtml = meta.length ? `<div class="flex gap-4 text-sm mb-4">${meta.join('')}</div>` : '';

  const ingRows = (r.ingredients || []).map(i => {
    const nameTr = t(i.product);
    const name = nameTr && nameTr.trim() !== '' ? nameTr : i.product;
    const qty = (i.quantity ?? '').toString();
    const unit = t(i.unit ?? '');
    const qtyStr = [qty, unit].filter(Boolean).join(' ');
    return `<tr><td class="pr-4">${name}</td><td class="text-right">${qtyStr}</td></tr>`;
  }).join('');

  const steps = (r.steps || []).map(s => `<li class="mb-2">${s}</li>`).join('');

  const favIcon = state.favoriteRecipes.has(r.name)
    ? '<i class="fa-solid fa-heart"></i>'
    : '<i class="fa-regular fa-heart"></i>';

  return `
    <div class="flex justify-between items-start mb-4">
      <h3 class="text-lg font-bold">${title}</h3>
      <button id="recipe-detail-fav" class="btn btn-ghost btn-sm" type="button" aria-label="${t('checkbox_favorite_label')}">${favIcon}</button>
    </div>
    ${metaHtml}
    <section class="mb-4">
      <h4 class="font-semibold mb-2">${t('recipe_ingredients_header')}</h4>
      <table class="table w-full">
        <tbody>${ingRows}</tbody>
      </table>
    </section>
    <section>
      <h4 class="font-semibold mb-2">${t('recipe_steps_header')}</h4>
      <ol class="list-decimal pl-6 space-y-2">${steps}</ol>
    </section>
  `;
}

export function openRecipeDetails(r) {
  const modal = document.getElementById('recipe-detail-modal');
  const content = modal?.querySelector('#recipe-detail-content');
  if (!modal || !content) return;

  content.innerHTML = renderRecipeDetail(r);

  let favChanged = false;
  const favBtn = content.querySelector('#recipe-detail-fav');
  favBtn?.addEventListener('click', async () => {
    favBtn.disabled = true;
    const prev = favBtn.innerHTML;
    favBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      await toggleFavorite(r.name);
      favBtn.innerHTML = state.favoriteRecipes.has(r.name)
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';
      favChanged = true;
    } catch (_) {
      favBtn.innerHTML = prev;
    } finally {
      favBtn.disabled = false;
    }
  });

  const onClose = () => {
    if (favChanged) {
      document.dispatchEvent(new Event('favorites-changed'));
    }
    modal.removeEventListener('close', onClose);
  };
  modal.addEventListener('close', onClose);

  modal.showModal();
}

