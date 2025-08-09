import { loadTranslations, loadUnits, loadFavorites, state, t, normalizeProduct, unitName } from './js/helpers.js';
import { renderProducts } from './js/components/product-table.js';
import { renderRecipes, loadRecipes } from './js/components/recipe-list.js';
import { renderShoppingList, addToShoppingList, renderSuggestions } from './js/components/shopping-list.js';
import { showNotification, checkLowStockToast } from './js/components/toast.js';
import { initReceiptImport } from './js/components/ocr-modal.js';

// CHANGELOG:
// - Refactored app boot sequence for deterministic init and fail-soft data loading.
// - Added retry-capable fetch helpers and mounted navigation before data fetching.


window.APP = window.APP || {};
const APP = window.APP;
APP.state = APP.state || {
  products: [],
  view: 'flat',
  filter: 'available',
  editing: false
};
APP.activeTab = APP.activeTab || null;

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    APP.state.products = data.map(normalizeProduct);
    renderProducts();
    renderSuggestions();
    checkLowStockToast(APP.state.products, activateTab, renderSuggestions, renderShoppingList);
  } catch (err) {
    APP.state.products = [];
    renderProducts();
    showNotification({ type: 'error', title: t('products_load_failed'), message: err.message, retry: fetchProducts });
  }
}

async function fetchRecipes() {
  try {
    await loadRecipes();
  } catch (err) {
    showNotification({ type: 'error', title: t('recipes_load_failed'), message: err.message, retry: fetchRecipes });
  }
}

async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.historyData = await res.json();
  } catch (err) {
    state.historyData = [];
    showNotification({ type: 'error', title: t('history_load_failed'), message: err.message, retry: fetchHistory });
  }
}

function resetProductFilter() {
  APP.state.filter = 'available';
  const sel = document.getElementById('state-filter');
  if (sel) sel.value = 'available';
}

function activateTab(targetId) {
  document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
  const tab = document.querySelector(`[data-tab-target="${targetId}"]`);
  if (tab) tab.classList.add('tab-active', 'font-bold');
  document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
  const panel = document.getElementById(targetId);
  if (panel) panel.style.display = 'block';
  if (targetId === 'tab-products' && APP.activeTab !== 'tab-products') {
    resetProductFilter();
    renderProducts();
  }
  APP.activeTab = targetId;
}

function mountNavigation() {
  document.querySelectorAll('[data-tab-target]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tabTarget;
      if (target === APP.activeTab) return;
      activateTab(target);
      localStorage.setItem('activeTab', target);
      history.pushState({ tab: target }, '');
    });
  });
  const initial = localStorage.getItem('activeTab') || 'tab-products';
  history.replaceState({ tab: initial }, '');
  activateTab(initial);
  window.addEventListener('popstate', e => {
    const target = e.state?.tab || 'tab-products';
    activateTab(target);
    localStorage.setItem('activeTab', target);
  });
}

window.addEventListener('pageshow', e => {
  if (e.persisted) {
    const target = localStorage.getItem('activeTab') || 'tab-products';
    if (target === 'tab-products') {
      resetProductFilter();
      renderProducts();
    }
  }
});

window.activateTab = activateTab;
window.addToShoppingList = addToShoppingList;

function initAddForm() {
  const form = document.getElementById('add-form');
  if (!form) return;
  const nameInput = form.querySelector('input[name="name"]');
  const qtyInput = form.querySelector('input[name="quantity"]');
  const catSelect = form.querySelector('select[name="category"]');
  const storSelect = form.querySelector('select[name="storage"]');
  const mainLabel = form.querySelector('input[name="main"]')?.closest('label');
  const submitBtn = form.querySelector('button[type="submit"]');
  const pkg = form.querySelector('input[name="package_size"]');
  const pack = form.querySelector('input[name="pack_size"]');
  const threshold = form.querySelector('input[name="threshold"]');

  pkg?.remove();
  pack?.remove();
  threshold?.remove();

  const unitSel = document.createElement('select');
  unitSel.name = 'unit';
  unitSel.className = 'select select-bordered w-full';
  Object.keys(state.units).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = unitName(u);
    unitSel.appendChild(opt);
  });
  qtyInput.insertAdjacentElement('afterend', unitSel);

  nameInput.classList.add('add-name');
  qtyInput.classList.add('add-qty', 'no-spinner');
  unitSel.classList.add('add-unit');
  catSelect.classList.add('add-category');
  storSelect.classList.add('add-storage');
  if (mainLabel) {
    mainLabel.classList.add('add-main', 'flex', 'items-center', 'gap-2');
    storSelect.insertAdjacentElement('afterend', mainLabel);
  }
  submitBtn.classList.add('add-submit');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: (data.get('name') || '').trim(),
      quantity: parseFloat(data.get('quantity')) || 0,
      unit: data.get('unit'),
      category: data.get('category'),
      storage: data.get('storage'),
      main: data.get('main') === 'on'
    };
    const thr = parseFloat(data.get('threshold'));
    if (!isNaN(thr)) payload.threshold = thr;
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      APP.state.products.push(normalizeProduct(created));
      renderProducts();
      form.reset();
    } catch (err) {
      showNotification({ type: 'error', title: t('save_failed'), message: err.message });
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function saveEdits() {
  const table = document.getElementById('product-table');
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const updates = [];
  rows.forEach(r => {
    const idx = Number(r.dataset.index);
    const orig = APP.state.products[idx];
    if (!orig) return;
    const qty = parseFloat(r.querySelector('.qty-cell input')?.value) || 0;
    const unit = r.querySelector('.unit-cell select')?.value || orig.unit;
    const cat = r.querySelector('.category-cell select')?.value || orig.category;
    const stor = r.querySelector('.storage-cell select')?.value || orig.storage;
    if (qty !== orig.quantity || unit !== orig.unit || cat !== orig.category || stor !== orig.storage) {
      updates.push({ ...orig, quantity: qty, unit, category: cat, storage: stor });
    }
  });
  if (!updates.length) return;
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showNotification({ type: 'success', title: t('save_success') });
    await fetchProducts();
  } catch (err) {
    showNotification({ type: 'error', title: t('save_failed'), message: err.message });
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  await loadUnits();
  mountNavigation();
  await loadFavorites();
  renderShoppingList();
  initReceiptImport();
  renderProducts();
  fetchProducts();
  fetchRecipes();
  fetchHistory();
  initAddForm();

  const editBtn = document.getElementById('edit-toggle');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-selected');
  const selectHeader = document.getElementById('select-header');
  editBtn?.addEventListener('click', () => {
    APP.state.editing = !APP.state.editing;
    editBtn.textContent = APP.state.editing ? t('edit_mode_button_off') : t('edit_mode_button_on');
    saveBtn.style.display = APP.state.editing ? '' : 'none';
    deleteBtn.style.display = APP.state.editing ? '' : 'none';
    selectHeader.style.display = APP.state.editing ? '' : 'none';
    renderProducts();
  });
  saveBtn?.addEventListener('click', saveEdits);
  const viewBtn = document.getElementById('view-toggle');
  viewBtn?.addEventListener('click', () => {
    APP.state.view = APP.state.view === 'flat' ? 'grouped' : 'flat';
    viewBtn.textContent = APP.state.view === 'grouped' ? t('change_view_toggle_flat') : t('change_view_toggle_grouped');
    renderProducts();
  });
  const filterSel = document.getElementById('state-filter');
  filterSel?.addEventListener('change', () => {
    APP.state.filter = filterSel.value;
    renderProducts();
  });
  const copyBtn = document.getElementById('copy-btn');
  copyBtn?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(APP.state.products, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});
