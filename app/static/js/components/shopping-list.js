import { t, state, isSpice, stockLevel, fetchJson, debounce, withButtonLoading } from '../helpers.js';
import { toast } from './toast.js';

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

export function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  if (!list) return;
  state.shoppingList.sort((a, b) => {
    if (a.inCart && b.inCart) return (a.cartTime || 0) - (b.cartTime || 0);
    if (a.inCart !== b.inCart) return a.inCart ? 1 : -1;
    return t(a.name).localeCompare(t(b.name));
  });
  const frag = document.createDocumentFragment();
  state.shoppingList.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className =
      'shopping-item flex items-center gap-2 py-2 min-h-11 hover:bg-base-200 transition-colors';
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
    if (item.inCart) nameEl.classList.add('line-through');
    nameWrap.appendChild(nameEl);
    if (stock && stock.quantity > 0) {
      const ownedEl = document.createElement('span');
      ownedEl.className = 'owned-info';
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
    qtyInput.className = 'input input-bordered w-16 h-11 text-center no-spinner';
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
    const onQtyChange = debounce(() => {
      const val = Math.max(1, parseInt(qtyInput.value) || 1);
      item.quantity = val;
      qtyInput.value = val;
      saveShoppingList();
    }, 150);
    qtyInput.addEventListener('change', onQtyChange);
    qtyWrap.append(dec, qtyInput, inc);
    row.appendChild(qtyWrap);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 ml-auto';
    const cartBtn = document.createElement('button');
    cartBtn.type = 'button';
    cartBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
    cartBtn.className = 'touch-btn';
    cartBtn.classList.toggle('text-primary', item.inCart);
    cartBtn.setAttribute('aria-label', t('in_cart'));
    cartBtn.setAttribute('title', t('in_cart'));
    cartBtn.addEventListener('click', async () => {
      await withButtonLoading(cartBtn, async () => {
        item.inCart = !item.inCart;
        if (item.inCart) {
          item.cartTime = Date.now();
          if (stock && isSpice(stock)) {
            try {
              await fetchJson('/api/products', { method: 'POST', body: { ...stock, level: 'high', quantity: 0 } });
              stock.level = 'high';
            } catch (e) {
              toast.error(t('notify_error_title'));
            }
          }
        } else {
          delete item.cartTime;
        }
        saveShoppingList();
        renderShoppingList();
      });
    });
    actions.appendChild(cartBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-error touch-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    delBtn.setAttribute('aria-label', t('delete_confirm_button'));
    delBtn.setAttribute('title', t('delete_confirm_button'));
    delBtn.addEventListener('click', () => {
      state.pendingRemoveIndex = idx;
      const modal = document.getElementById('shopping-delete-modal');
      if (modal) modal.showModal();
    });
    actions.appendChild(delBtn);
    row.appendChild(actions);

    frag.appendChild(row);
  });
  requestAnimationFrame(() => {
    list.innerHTML = '';
    list.appendChild(frag);
  });
}

export function renderSuggestions() {
  const container = document.getElementById('suggestion-list');
  if (!container) return;
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
      'suggestion-item flex items-center gap-2 py-2 min-h-11 hover:bg-base-200 transition-colors';
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
    if (p.quantity > 0) {
      const owned = document.createElement('span');
      owned.className = 'owned-info';
      owned.textContent = `${t('owned')}: ${p.quantity}`;
      nameWrap.appendChild(owned);
    }
    row.appendChild(nameWrap);

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
    qtyInput.className = 'input input-bordered w-16 h-11 text-center no-spinner';
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
    const onChange = debounce(() => {
      qty = Math.max(1, parseInt(qtyInput.value) || 1);
      qtyInput.value = qty;
    }, 150);
    qtyInput.addEventListener('change', onChange);
    qtyWrap.append(dec, qtyInput, inc);
    row.appendChild(qtyWrap);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 ml-auto';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.innerHTML = '<i class="fa-solid fa-check"></i>';
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
    reject.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    reject.className = 'touch-btn text-error';
    reject.setAttribute('aria-label', t('reject_action'));
    reject.setAttribute('title', t('reject_action'));
    reject.addEventListener('click', () => {
      state.dismissedSuggestions.add(p.name);
      row.remove();
    });
    actions.append(accept, reject);
    row.appendChild(actions);

    frag.appendChild(row);
  });
  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(frag);
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
