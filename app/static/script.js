import { loadTranslations, loadUnits, loadFavorites, state, t, normalizeProduct, applyTranslations, fetchJson } from './js/helpers.js';
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
APP.editBackup = APP.editBackup || null;

async function fetchProducts() {
  try {
    const data = await fetchJson('/api/products');
    APP.state.products = data.map(normalizeProduct);
    renderProducts();
    renderSuggestions();
    checkLowStockToast(APP.state.products, activateTab, renderSuggestions, renderShoppingList);
  } catch (err) {
    APP.state.products = [];
    renderProducts();
    showNotification({ type: 'error', title: t('products_load_failed'), message: err.body?.message || String(err.status), retry: fetchProducts });
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
    state.historyData = await fetchJson('/api/history');
  } catch (err) {
    state.historyData = [];
    showNotification({ type: 'error', title: t('history_load_failed'), message: err.body?.message || String(err.status), retry: fetchHistory });
  }
}

async function checkHealth() {
  try {
    await fetchJson('/api/health');
    document.getElementById('health-banner')?.classList.add('hidden');
    return true;
  } catch (err) {
    document.getElementById('health-banner')?.classList.remove('hidden');
    return false;
  }
}

function resetProductFilter() {
  APP.state.filter = 'available';
  const sel = document.getElementById('state-filter');
  if (sel) sel.value = 'available';
}

function resetRecipeFilters() {
  state.recipeSortField = 'name';
  state.recipeSortDir = 'asc';
  state.recipeTimeFilter = '';
  state.recipePortionsFilter = '';
  state.showFavoritesOnly = false;
  const sortField = document.getElementById('recipe-sort-field');
  const sortMobile = document.getElementById('recipe-sort-mobile');
  const timeFilter = document.getElementById('recipe-time-filter');
  const portionsFilter = document.getElementById('recipe-portions-filter');
  const favToggle = document.getElementById('recipe-favorites-toggle');
  sortField && (sortField.value = 'name');
  sortMobile && (sortMobile.value = 'name-asc');
  timeFilter && (timeFilter.value = '');
  portionsFilter && (portionsFilter.value = '');
  if (favToggle) {
    favToggle.classList.remove('btn-primary');
    favToggle.classList.add('btn-outline');
  }
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
  if (targetId === 'tab-recipes' && APP.activeTab !== 'tab-recipes') {
    resetRecipeFilters();
    renderRecipes();
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
    opt.textContent = t(u);
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
      await fetchJson('/api/products', {
        method: 'POST',
        body: payload
      });
      await fetchProducts();
      form.reset();
      document.getElementById('product-search')?.focus();
    } catch (err) {
      showNotification({ type: 'error', title: t('save_failed'), message: err.body?.message || String(err.status) });
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function saveEdits() {
  const rows = APP.state.view === 'flat'
    ? Array.from(document.querySelectorAll('#product-table tbody tr'))
    : Array.from(document.querySelectorAll('#products-by-category tbody tr'));
  const updates = [];
  rows.forEach(r => {
    const idx = Number(r.dataset.index);
    const orig = APP.editBackup?.[idx];
    if (!orig) return;
    const qty = parseFloat(r.querySelector('.qty-cell input')?.value) || orig.quantity;
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
    await fetchJson('/api/products', {
      method: 'PUT',
      body: updates
    });
    showNotification({ type: 'success', title: t('save_success') });
    await fetchProducts();
  } catch (err) {
    showNotification({ type: 'error', title: t('save_failed'), message: err.body?.message || String(err.status) });
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  await loadUnits();
  applyTranslations();
  document.documentElement.setAttribute('lang', state.currentLang);
  mountNavigation();
  await loadFavorites();
  renderShoppingList();
  initReceiptImport();
  renderProducts();
  checkHealth();
  fetchProducts();
  fetchRecipes();
  fetchHistory();
  initAddForm();

  const langBtn = document.getElementById('lang-toggle');
  langBtn.textContent = state.currentLang.toUpperCase();
  langBtn.addEventListener('click', () => {
    const scroll = window.scrollY;
    state.currentLang = state.currentLang === 'pl' ? 'en' : 'pl';
    localStorage.setItem('lang', state.currentLang);
    langBtn.textContent = state.currentLang.toUpperCase();
    document.documentElement.setAttribute('lang', state.currentLang);
    applyTranslations();
    renderProducts();
    renderRecipes();
    renderShoppingList();
    renderSuggestions();
    const unitSel = document.querySelector('#add-form select[name="unit"]');
    if (unitSel) {
      Array.from(unitSel.options).forEach(opt => {
        opt.textContent = t(opt.value);
      });
    }
    window.scrollTo(0, scroll);
  });

  const editBtn = document.getElementById('edit-toggle');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-selected');
  const selectHeader = document.getElementById('select-header');
  function enterEditMode() {
    APP.editBackup = JSON.parse(JSON.stringify(APP.state.products));
    APP.state.editing = true;
    editBtn.textContent = t('edit_mode_button_off');
    saveBtn.style.display = '';
    deleteBtn.style.display = '';
    deleteBtn.disabled = true;
    deleteBtn.textContent = t('delete_selected_button');
    selectHeader.style.display = '';
    renderProducts();
  }

  function exitEditMode(discard) {
    if (discard && APP.editBackup) {
      APP.state.products = APP.editBackup;
    }
    APP.editBackup = null;
    APP.state.editing = false;
    editBtn.textContent = t('edit_mode_button_on');
    saveBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    deleteBtn.disabled = true;
    deleteBtn.textContent = t('delete_selected_button');
    selectHeader.style.display = 'none';
    renderProducts();
  }

  editBtn?.addEventListener('click', () => {
    if (APP.state.editing) exitEditMode(true);
    else enterEditMode();
  });

  saveBtn?.addEventListener('click', async () => {
    await saveEdits();
    exitEditMode(false);
  });

  const viewBtn = document.getElementById('view-toggle');
  viewBtn?.addEventListener('click', () => {
    if (APP.state.editing) exitEditMode(true);
    APP.state.view = APP.state.view === 'flat' ? 'grouped' : 'flat';
    viewBtn.textContent = APP.state.view === 'grouped' ? t('change_view_toggle_flat') : t('change_view_toggle_grouped');
    renderProducts();
  });
  const filterSel = document.getElementById('state-filter');
  filterSel?.addEventListener('change', () => {
    APP.state.filter = filterSel.value;
    renderProducts();
  });
  const retryBtn = document.getElementById('health-retry');
  retryBtn?.addEventListener('click', async () => {
    if (await checkHealth()) {
      window.location.reload();
    }
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
