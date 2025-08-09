import { t, state, isSpice } from '../helpers.js';

// CHANGELOG:
// - Added optional retry button to ``showNotification`` for non-blocking error toasts.

export function showNotification({ type = 'success', title = '', message = '', retry = null }) {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const alert = document.createElement('div');
  alert.className = `alert ${type === 'error' ? 'alert-error' : 'alert-success'} shadow-lg relative`;
  const body = document.createElement('div');
  body.className = 'flex gap-2';
  const icon = document.createElement('span');
  icon.innerHTML = type === 'error'
    ? '<i class="fa-solid fa-circle-xmark"></i>'
    : '<i class="fa-solid fa-circle-check"></i>';
  const text = document.createElement('div');
  if (title) {
    const titleEl = document.createElement('span');
    titleEl.className = 'font-bold block';
    titleEl.textContent = title;
    text.appendChild(titleEl);
  }
  if (message) {
    const msgEl = document.createElement('span');
    msgEl.textContent = message;
    text.appendChild(msgEl);
  }
  body.appendChild(icon);
  body.appendChild(text);
  alert.appendChild(body);
  if (retry) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm ml-4';
    btn.textContent = t('retry');
    btn.addEventListener('click', () => {
      alert.remove();
      retry();
    });
    alert.appendChild(btn);
  }
  const close = document.createElement('button');
  close.className = 'btn btn-xs btn-circle btn-ghost absolute top-1 right-1';
  close.setAttribute('aria-label', t('close'));
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener('click', () => alert.remove());
  alert.appendChild(close);
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

export function showToast(message, type = 'success') {
  showNotification({ type, title: message });
}

export function showLowStockToast(activateTab, renderSuggestions, renderShoppingList) {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const existing = container.querySelector('[data-toast="low-stock"]');
  if (existing) existing.remove();
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning relative';
  alert.dataset.toast = 'low-stock';
  const span = document.createElement('span');
  span.textContent = t('toast_low_stock');
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm ml-4';
  btn.dataset.action = 'shopping';
  btn.textContent = t('toast_go_shopping');
  btn.addEventListener('click', () => {
    activateTab('tab-shopping');
    localStorage.setItem('activeTab', 'tab-shopping');
    history.pushState({ tab: 'tab-shopping' }, '');
    renderSuggestions();
    renderShoppingList();
    alert.remove();
  });
  const close = document.createElement('button');
  close.className = 'btn btn-xs btn-circle btn-ghost absolute top-1 right-1';
  close.dataset.action = 'close';
  close.setAttribute('title', t('toast_close'));
  close.setAttribute('aria-label', t('close'));
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener('click', () => {
    alert.remove();
  });
  alert.appendChild(span);
  alert.appendChild(btn);
  alert.appendChild(close);
  container.appendChild(alert);
  state.lowStockToastShown = true;
}

export function checkLowStockToast(currentProducts, activateTab, renderSuggestions, renderShoppingList) {
  const low = (currentProducts || []).some(p => {
    if (isSpice(p)) return ['none', 'low'].includes(p.level);
    return p.main && p.threshold !== null && p.quantity <= p.threshold;
  });
  const container = document.getElementById('notification-container');
  const toast = container ? container.querySelector('[data-toast="low-stock"]') : null;
  if (low) {
    if (!state.lowStockToastShown) {
      showLowStockToast(activateTab, renderSuggestions, renderShoppingList);
    } else if (toast) {
      toast.querySelector('span').textContent = t('toast_low_stock');
      const btn = toast.querySelector('button[data-action="shopping"]');
      if (btn) btn.textContent = t('toast_go_shopping');
      const close = toast.querySelector('button[data-action="close"]');
      if (close) close.setAttribute('title', t('toast_close'));
    }
  } else {
    if (toast) toast.remove();
    state.lowStockToastShown = false;
  }
}
