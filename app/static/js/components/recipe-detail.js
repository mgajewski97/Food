function t(key){ return window.t?.(key) ?? key; }

export function renderRecipeDetail(r){
  const meta = `
    <div class="meta flex items-center gap-6 mb-4">
      <div class="flex items-center gap-2"><i class="fa-regular fa-clock"></i><span>${r.time ?? '—'}</span></div>
      <div class="flex items-center gap-2"><i class="fa-regular fa-users"></i><span>${r.portions ?? '—'}</span></div>
    </div>
  `;

  const ing = (r.ingredients||[]).map(i=>{
    const name = t(i.product);
    const qty  = (i.quantity ?? '').toString();
    const unit = t(i.unit ?? '');
    return `<div class="ing-row grid grid-cols-[1fr_auto] gap-3"><span>${name}</span><span class="opacity-80">${qty} ${unit}</span></div>`;
  }).join('');

  const steps = (r.steps||[]).map((s,idx)=>`
    <li class="leading-relaxed"><span class="step-index">${idx+1}.</span> ${s}</li>
  `).join('');

  return `
    ${meta}
    <div class="grid md:grid-cols-2 gap-8">
      <section>
        <h4 class="font-semibold mb-2">${t('recipe_ingredients_header')}</h4>
        <div class="ing-list flex flex-col gap-2">${ing}</div>
      </section>
      <section>
        <h4 class="font-semibold mb-2">${t('recipe_steps_header')}</h4>
        <ol class="list-decimal ml-5 flex flex-col gap-2">${steps}</ol>
      </section>
    </div>
  `;
}
