import { t, state, productName, isSpice } from '../helpers.js';

function saveShoppingList() {
  localStorage.setItem('shoppingList', JSON.stringify(state.shoppingList));
}

export function addToShoppingList(name, quantity = 1) {
  quantity = parseFloat(quantity) || 1;
  const existing = state.shoppingList.find(item => item.name === name);
  if (existing) {
    existing.quantity += quantity;
  } else {
    state.shoppingList.push({ name, quantity, inCart: false });
  }
  saveShoppingList();
  renderShoppingList();
}

export function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  if (!list) return;
  list.innerHTML = '';
  state.shoppingList.sort((a, b) => {
    if (a.inCart && b.inCart) return (a.cartTime || 0) - (b.cartTime || 0);
    if (a.inCart !== b.inCart) return a.inCart ? 1 : -1;
    return productName(a.name).localeCompare(productName(b.name));
  });
  state.shoppingList.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className =
      'shopping-item flex flex-nowrap items-center gap-3 p-2 min-h-12 hover:bg-base-200 transition-colors';
    if (item.inCart) row.classList.add('opacity-50', 'italic');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flex-1 overflow-hidden';
    const nameEl = document.createElement('div');
    nameEl.textContent = productName(item.name);
    nameEl.className = 'truncate';
    if (item.inCart) nameEl.classList.add('line-through');
    nameWrap.appendChild(nameEl);
    const stock = (window.APP?.state?.products || []).find(p => p.name === item.name);
    if (stock) {
      const ownedEl = document.createElement('div');
      ownedEl.className = 'text-xs text-secondary truncate';
      ownedEl.textContent = `${t('owned')}: ${stock.quantity}`;
      nameWrap.appendChild(ownedEl);
    }
    row.appendChild(nameWrap);
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'flex items-center gap-2';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
    dec.className = 'touch-btn';
    dec.disabled = item.inCart;
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = item.quantity;
    qtyInput.className = 'input input-bordered w-12 h-10 text-center no-spinner';
    qtyInput.disabled = item.inCart;
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
    inc.className = 'touch-btn';
    inc.disabled = item.inCart;
    dec.addEventListener('click', () => {
      const newVal = Math.max(1, (parseInt(qtyInput.value) || 1) - 1);
      item.quantity = newVal;
      qtyInput.value = newVal;
      saveShoppingList();
    });
    inc.addEventListener('click', () => {
      const newVal = (parseInt(qtyInput.value) || 1) + 1;
      item.quantity = newVal;
      qtyInput.value = newVal;
      saveShoppingList();
    });
    qtyInput.addEventListener('change', () => {
      const val = Math.max(1, parseInt(qtyInput.value) || 1);
      item.quantity = val;
      qtyInput.value = val;
      saveShoppingList();
    });
    qtyWrap.append(dec, qtyInput, inc);
    row.appendChild(qtyWrap);
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    acceptBtn.className = 'touch-btn' + (item.inCart ? ' text-success' : '');
    acceptBtn.setAttribute('aria-label', t('in_cart'));
    acceptBtn.addEventListener('click', () => {
      item.inCart = !item.inCart;
      if (item.inCart) {
        item.cartTime = Date.now();
      } else {
        delete item.cartTime;
      }
      saveShoppingList();
      renderShoppingList();
    });
    actions.appendChild(acceptBtn);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-error touch-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    delBtn.setAttribute('aria-label', t('delete_confirm_button'));
    delBtn.addEventListener('click', () => {
      state.pendingRemoveIndex = idx;
      const modal = document.getElementById('shopping-delete-modal');
      if (modal) modal.showModal();
    });
    actions.appendChild(delBtn);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

export function renderSuggestions() {
  const container = document.getElementById('suggestion-list');
  if (!container) return;
  container.innerHTML = '';
  const products = window.APP?.state?.products || [];
  const suggestions = products
    .filter(p => {
      if (isSpice(p)) {
        return ['none', 'low'].includes(p.level);
      }
      return p.main && (p.quantity === 0 || (p.threshold != null && p.quantity <= p.threshold));
    })
    .filter(p => !state.dismissedSuggestions.has(p.name))
    .sort((a, b) => productName(a.name).localeCompare(productName(b.name)));
  suggestions.forEach(p => {
    let qty = 1;
    const row = document.createElement('div');
    row.className =
      'suggestion-item flex flex-nowrap items-center gap-3 p-2 min-h-12 hover:bg-base-200 transition-colors';
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
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = qty;
    qtyInput.className = 'input input-bordered w-12 h-10 text-center no-spinner';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
    inc.className = 'touch-btn';
    dec.addEventListener('click', () => {
      qty = Math.max(1, qty - 1);
      qtyInput.value = qty;
    });
    inc.addEventListener('click', () => {
      qty += 1;
      qtyInput.value = qty;
    });
    qtyInput.addEventListener('change', () => {
      qty = Math.max(1, parseInt(qtyInput.value) || 1);
      qtyInput.value = qty;
    });
    qtyWrap.append(dec, qtyInput, inc);
    row.appendChild(qtyWrap);
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-3';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.innerHTML = '<i class="fa-solid fa-check"></i>';
    accept.className = 'touch-btn text-success';
    accept.setAttribute('aria-label', t('accept_action'));
    accept.addEventListener('click', () => {
      state.dismissedSuggestions.add(p.name);
      addToShoppingList(p.name, qty);
      row.remove();
    });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    reject.className = 'touch-btn text-error';
    reject.setAttribute('aria-label', t('reject_action'));
    reject.addEventListener('click', () => {
      state.dismissedSuggestions.add(p.name);
      row.remove();
    });
    actions.append(accept, reject);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

// Handle item removal confirmation once
document.getElementById('confirm-remove-item')?.addEventListener('click', () => {
  if (state.pendingRemoveIndex != null) {
    state.shoppingList.splice(state.pendingRemoveIndex, 1);
    state.pendingRemoveIndex = null;
    saveShoppingList();
    renderShoppingList();
  }
});
