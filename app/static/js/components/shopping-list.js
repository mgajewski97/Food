import { t, state, isSpice, stockLevel, fetchJson, debounce } from '../helpers.js';
import { toast } from './toast.js';

function saveShoppingList() {
  localStorage.setItem('shoppingList', JSON.stringify(state.shoppingList));
}

export function addToShoppingList(name, quantity = 1) {
  if (!name) {
    toast.error(t('notify_error_title'));
    return;
  }
  quantity = parseFloat(quantity) || 1;
  const existing = state.shoppingList.find(item => item.name === name);
  if (existing) {
    existing.quantity += quantity;
    saveShoppingList();
    const row = document.querySelector(`#shopping-list .shopping-item[data-name="${CSS.escape(name)}"] input`);
    if (row) row.value = existing.quantity;
  } else {
    const item = { name, quantity, inCart: false };
    state.shoppingList.push(item);
    saveShoppingList();
    sortShoppingList();
    const list = document.getElementById('shopping-list');
    const newIndex = state.shoppingList.indexOf(item);
    const newRow = renderShoppingItem(item, newIndex);
    const ref = list?.children[newIndex];
    if (ref) {
      list.insertBefore(newRow, ref);
    } else {
      list?.appendChild(newRow);
    }
    if (list) [...list.children].forEach((el, i) => (el.dataset.index = i));
  }
  toast.success(t('manual_add_success'), '', {
    label: t('toast_go_shopping'),
    onClick: () => {
      window.activateTab('tab-shopping');
      localStorage.setItem('activeTab', 'tab-shopping');
      history.pushState({ tab: 'tab-shopping' }, '');
      renderSuggestions();
      renderShoppingList();
    }
  });
}
function sortShoppingList() {
  state.shoppingList.sort((a, b) => {
    if (a.inCart && b.inCart) return (a.cartTime || 0) - (b.cartTime || 0);
    if (a.inCart !== b.inCart) return a.inCart ? 1 : -1;
    return t(a.name).localeCompare(t(b.name));
  });
}

function renderShoppingItem(item, idx) {
  const row = document.createElement('div');
  row.className = 'shopping-item flex items-center gap-2 h-11 hover:bg-base-200 transition-colors';
  row.dataset.index = idx;
  row.dataset.name = item.name;
  if (item.inCart) row.classList.add('in-cart');

  const stock = (window.APP?.state?.products || []).find(p => p.name === item.name);
  if (stock) {
    const level = stockLevel(stock);
    if (level === 'low') row.classList.add('product-low');
    if (level === 'none') row.classList.add('product-missing');
  }

  const nameWrap = document.createElement('div');
  nameWrap.className = 'flex items-center gap-1 flex-1 overflow-hidden';
  const nameEl = document.createElement('span');
  nameEl.className = 'truncate';
  nameEl.textContent = t(item.name);
  nameEl.title = t(item.name);
  if (item.inCart) nameEl.classList.add('line-through');
  nameWrap.appendChild(nameEl);
  row.appendChild(nameWrap);

  const qtyWrap = document.createElement('div');
  qtyWrap.className = 'flex items-center gap-2';
  const dec = document.createElement('button');
  dec.type = 'button';
  dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
  dec.className = 'touch-btn';
  dec.setAttribute('aria-label', t('decrease_quantity'));
  dec.disabled = item.inCart;
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '1';
  qtyInput.value = item.quantity;
  qtyInput.className = 'input input-bordered w-16 h-11 text-center no-spinner';
  qtyInput.disabled = item.inCart;
  const inc = document.createElement('button');
  inc.type = 'button';
  inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
  inc.className = 'touch-btn';
  inc.setAttribute('aria-label', t('increase_quantity'));
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
  qtyInput.addEventListener(
    'input',
    debounce(() => {
      const val = Math.max(1, parseInt(qtyInput.value) || 1);
      item.quantity = val;
      qtyInput.value = val;
      saveShoppingList();
    }, 150)
  );
  qtyWrap.append(dec, qtyInput, inc);
  row.appendChild(qtyWrap);

  const cartBtn = document.createElement('button');
  cartBtn.type = 'button';
  cartBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
  cartBtn.className = 'touch-btn';
  cartBtn.classList.toggle('text-primary', item.inCart);
  cartBtn.setAttribute('aria-label', t('in_cart'));
  cartBtn.setAttribute('title', t('in_cart'));
  cartBtn.setAttribute('aria-pressed', item.inCart);
  cartBtn.addEventListener('click', async () => {
    const list = document.getElementById('shopping-list');
    const oldRow = cartBtn.closest('.shopping-item');
    item.inCart = !item.inCart;
    if (item.inCart) {
      item.cartTime = Date.now();
    } else {
      delete item.cartTime;
    }
    cartBtn.disabled = true;
    const prev = cartBtn.innerHTML;
    if (item.inCart && stock && isSpice(stock)) {
      cartBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await fetchJson('/api/products', { method: 'POST', body: { ...stock, level: 'high', quantity: 0 } });
        stock.level = 'high';
      } catch (e) {
        toast.error(t('notify_error_title'));
      }
    }
    saveShoppingList();
    sortShoppingList();
    const newIndex = state.shoppingList.indexOf(item);
    const newRow = renderShoppingItem(item, newIndex);
    requestAnimationFrame(() => {
      cartBtn.disabled = false;
      cartBtn.innerHTML = prev;
      const ref = list.children[newIndex];
      if (ref && ref !== oldRow) {
        list.insertBefore(newRow, ref);
        oldRow.remove();
      } else {
        oldRow.replaceWith(newRow);
      }
      [...list.children].forEach((el, i) => (el.dataset.index = i));
    });
  });
  row.appendChild(cartBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'touch-btn text-error';
  delBtn.innerHTML = '<i class="fa-solid fa-circle-minus"></i>';
  delBtn.setAttribute('aria-label', t('delete_confirm_button'));
  delBtn.setAttribute('title', t('delete_confirm_button'));
  delBtn.addEventListener('click', () => {
    if (!confirm(t('delete_confirm_button'))) return;
    const list = document.getElementById('shopping-list');
    const idx = parseInt(row.dataset.index, 10);
    state.shoppingList.splice(idx, 1);
    row.remove();
    saveShoppingList();
    if (list) [...list.children].forEach((el, i) => (el.dataset.index = i));
  });
  row.appendChild(delBtn);

  return row;
}

export function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  if (!list) return;
  sortShoppingList();
  const frag = document.createDocumentFragment();
  state.shoppingList.forEach((item, idx) => frag.appendChild(renderShoppingItem(item, idx)));
  requestAnimationFrame(() => {
    list.innerHTML = '';
    list.appendChild(frag);
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
    .sort((a, b) => t(a.name).localeCompare(t(b.name)));
  const frag = document.createDocumentFragment();
  suggestions.forEach(p => {
    let qty = p.threshold != null ? p.threshold : 1;
    const row = document.createElement('div');
    row.className =
      'suggestion-item flex items-center gap-2 h-11 hover:bg-base-200 transition-colors';
    const level = stockLevel(p);
    if (level === 'low') row.classList.add('product-low');
    if (level === 'none') row.classList.add('product-missing');

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flex items-center gap-1 flex-1 overflow-hidden';
    const nameEl = document.createElement('span');
    nameEl.className = 'truncate';
    nameEl.textContent = t(p.name);
    nameEl.title = t(p.name);
    nameWrap.appendChild(nameEl);
    row.appendChild(nameWrap);

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'flex items-center gap-2';
  const dec = document.createElement('button');
  dec.type = 'button';
  dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
  dec.className = 'touch-btn';
  dec.setAttribute('aria-label', t('decrease_quantity'));
  const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = qty;
    qtyInput.className = 'input input-bordered w-16 h-11 text-center no-spinner';
  const inc = document.createElement('button');
  inc.type = 'button';
  inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
  inc.className = 'touch-btn';
  inc.setAttribute('aria-label', t('increase_quantity'));
    dec.addEventListener('click', () => {
      qty = Math.max(1, qty - 1);
      qtyInput.value = qty;
    });
    inc.addEventListener('click', () => {
      qty += 1;
      qtyInput.value = qty;
    });
    qtyInput.addEventListener(
      'input',
      debounce(() => {
        qty = Math.max(1, parseInt(qtyInput.value) || 1);
        qtyInput.value = qty;
      }, 150)
    );
    qtyWrap.append(dec, qtyInput, inc);
    if (p.quantity > 0) {
      const owned = document.createElement('span');
      owned.className = 'owned-info';
      owned.textContent = `(${t('owned')}: ${p.quantity})`;
      qtyWrap.appendChild(owned);
    }
    row.appendChild(qtyWrap);

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.innerHTML = '<i class="fa-regular fa-circle-check"></i>';
    accept.className = 'touch-btn text-success';
    accept.setAttribute('aria-label', t('accept_action'));
    accept.setAttribute('title', t('accept_action'));
    accept.addEventListener('click', () => {
      state.dismissedSuggestions.add(p.name);
      addToShoppingList(p.name, qty);
      row.remove();
    });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.innerHTML = '<i class="fa-regular fa-circle-xmark"></i>';
    reject.className = 'touch-btn text-error';
    reject.setAttribute('aria-label', t('reject_action'));
    reject.setAttribute('title', t('reject_action'));
    reject.addEventListener('click', () => {
      state.dismissedSuggestions.add(p.name);
      row.remove();
    });
    row.append(accept, reject);

    frag.appendChild(row);
  });
  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(frag);
  });
}

