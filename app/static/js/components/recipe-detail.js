import { t } from '../helpers.js';

export function openRecipeDetails(recipe) {
  const modal = document.getElementById('recipe-detail-modal');
  if (!modal) return;
  const title = document.getElementById('recipe-detail-title');
  if (title) title.textContent = t(recipe.name);
  const timeWrap = document.getElementById('recipe-detail-time');
  const timeSpan = timeWrap ? timeWrap.querySelector('span') : null;
  if (timeWrap && timeSpan) {
    timeSpan.textContent = recipe.time || '';
    timeWrap.style.display = recipe.time ? 'inline-flex' : 'none';
    timeWrap.setAttribute('aria-label', t('label_time'));
  }
  const portionsWrap = document.getElementById('recipe-detail-portions');
  const portionsSpan = portionsWrap ? portionsWrap.querySelector('span') : null;
  if (portionsWrap && portionsSpan) {
    portionsSpan.textContent = recipe.portions ? String(recipe.portions) : '';
    portionsWrap.style.display = recipe.portions ? 'inline-flex' : 'none';
    portionsWrap.setAttribute('aria-label', t('label_portions'));
  }
  const ingList = document.getElementById('recipe-ingredients');
  if (ingList) {
    ingList.innerHTML = '';
    (recipe.ingredients || []).forEach(ing => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      const qty = document.createElement('span');
      name.textContent = t(ing.productKey);
      let text = '';
      if (ing.quantity != null) text += ing.quantity;
      if (ing.unit) text += ` ${t(ing.unit)}`;
      qty.textContent = text.trim();
      li.append(name, qty);
      ingList.appendChild(li);
    });
  }
  const stepsOl = document.getElementById('recipe-steps');
  if (stepsOl) {
    stepsOl.innerHTML = '';
    (recipe.steps || []).forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      stepsOl.appendChild(li);
    });
  }
  const addBtn = document.getElementById('recipe-add-to-shopping');
  if (addBtn) addBtn.onclick = () => {};
  modal.showModal();
}
