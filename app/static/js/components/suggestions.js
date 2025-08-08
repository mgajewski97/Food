import { t, productName, state } from '../helpers.js';
import { addToShoppingList } from './shopping-list.js';

const dismissed = new Set();

export function renderSuggestions() {
  const container = document.getElementById('suggestion-list');
  if (!container) return;
  container.innerHTML = '';

  const products = window.currentProducts || [];
  const inShopping = new Set(state.shoppingList.map(item => item.name));

  products
    .filter(p =>
      p.main && p.threshold !== null && p.quantity <= p.threshold &&
      !dismissed.has(p.name) && !inShopping.has(p.name)
    )
    .sort((a, b) => productName(a.name).localeCompare(productName(b.name)))
    .forEach(p => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-2 suggestion-item';

      const nameEl = document.createElement('div');
      nameEl.className = 'flex-1 truncate';
      nameEl.textContent = productName(p.name);
      row.appendChild(nameEl);

      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'flex items-center gap-2';
      const dec = document.createElement('button');
      dec.type = 'button';
      dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
      dec.className = 'touch-btn';
      const qty = document.createElement('span');
      qty.className = 'w-10 h-10 inline-flex items-center justify-center text-center';
      qty.textContent = '1';
      const inc = document.createElement('button');
      inc.type = 'button';
      inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
      inc.className = 'touch-btn';
      dec.addEventListener('click', () => {
        const val = Math.max(1, (parseInt(qty.textContent) || 1) - 1);
        qty.textContent = val;
      });
      inc.addEventListener('click', () => {
        const val = (parseInt(qty.textContent) || 1) + 1;
        qty.textContent = val;
      });
      qtyWrap.append(dec, qty, inc);
      row.appendChild(qtyWrap);

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';
      const acceptBtn = document.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.className = 'touch-btn text-success';
      acceptBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      acceptBtn.setAttribute('aria-label', t('save_button'));
      acceptBtn.addEventListener('click', () => {
        addToShoppingList(p.name, parseInt(qty.textContent) || 1);
        dismissed.add(p.name);
        row.remove();
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'touch-btn text-error';
      rejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      rejectBtn.setAttribute('aria-label', t('delete_cancel_button'));
      rejectBtn.addEventListener('click', () => {
        dismissed.add(p.name);
        row.remove();
      });
      actions.append(acceptBtn, rejectBtn);
      row.appendChild(actions);

      container.appendChild(row);
    });
}
