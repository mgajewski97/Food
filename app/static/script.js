// FIX: Render & responsive boot (2025-08-09)
import {
  t,
  fetchJson,
  showTopBanner,
  loadTranslations,
  loadDomain,
  loadFavorites,
  state,
  normalizeProduct,
  applyTranslations,
  isSpice,
  debounce,
  DEBUG
} from './js/helpers.js';
import * as ProductTable from './js/components/product-table.js';
import * as Shopping from './js/components/shopping-list.js';
import * as Recipes from './js/components/recipe-list.js';
import { initReceiptImport } from './js/components/ocr-modal.js';
import { toast, showNotification, checkLowStockToast } from './js/components/toast.js';
import './js/components/recipe-detail.js';

function trace(p){
  if (DEBUG) console.info('[BOOT]', p);
}
window.trace = trace;

// CHANGELOG:
// - Refactored app boot sequence for deterministic init and fail-soft data loading.
// - Added retry-capable fetch helpers and mounted navigation before data fetching.


window.APP = window.APP || { state: {}, ui: {} };
const APP = window.APP;
APP.state = APP.state || {
  products: [],
  view: 'flat',
  filter: 'all',
  search: '',
  editing: false
};
APP.ui = APP.ui || {};
APP.activeTab = APP.activeTab || null;
APP.editBackup = APP.editBackup || null;

async function loadProducts() {
  trace('loadProducts:enter');
  try {
    const data = await fetchJson('/api/products');
    APP.state.products = Array.isArray(data) ? data.map(normalizeProduct) : [];
    ProductTable.renderProducts();
    Shopping.renderSuggestions();
    checkLowStockToast(APP.state.products, activateTab, Shopping.renderSuggestions, Shopping.renderShoppingList);
      if (!APP._productsLoaded) {
        if (DEBUG) console.info('Products loaded:', APP.state.products.length);
        APP._productsLoaded = true;
      }
    trace('loadProducts:ok');
  } catch (e) {
    console.error(e);
    showTopBanner(t('load_products_failed'), { actionLabel: t('retry'), onAction: loadProducts });
    throw e;
  }
}

async function loadRecipes() {
  trace('loadRecipes:enter');
  try {
    await Recipes.loadRecipes();
    trace('loadRecipes:ok');
  } catch (e) {
    console.error(e);
    showTopBanner(t('load_recipes_failed'), { actionLabel: t('retry'), onAction: loadRecipes });
    throw e;
  }
}

async function loadHistory() {
  trace('loadHistory:enter');
  try {
    state.historyData = await fetchJson('/api/history');
    trace('loadHistory:ok');
  } catch (e) {
    console.error(e);
    showTopBanner(t('load_history_failed'), { actionLabel: t('retry'), onAction: loadHistory });
    throw e;
  }
}

async function checkHealth() {
  try {
    await fetchJson('/api/health');
    return true;
  } catch (err) {
    const banner = document.getElementById('health-banner');
    const retry = document.getElementById('health-retry');
    banner?.classList.remove('hidden');
    if (retry) {
      retry.onclick = async () => {
        banner.classList.add('hidden');
        const ok = await checkHealth();
        if (ok) location.reload();
      };
    }
    return false;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js');
    });
  }
}

function resetProductFilters() {
  APP.state.filter = 'all';
  APP.state.search = '';
  const sel = document.getElementById('state-filter');
  if (sel) sel.value = 'all';
  const selMobile = document.getElementById('state-filter-mobile');
  if (selMobile) selMobile.value = 'all';
  const search = document.getElementById('product-search');
  if (search) search.value = '';
  const searchMobile = document.getElementById('product-search-mobile');
  if (searchMobile) searchMobile.value = '';
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

async function activateTab(targetId) {
  document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
  const tab = document.querySelector(`[data-tab-target="${targetId}"]`);
  if (tab) tab.classList.add('tab-active', 'font-bold');
  document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
  const panel = document.getElementById(targetId);
  if (panel) panel.style.display = 'block';
  if (targetId === 'tab-products') {
    resetProductFilters();
    if (!APP.state.products || APP.state.products.length === 0) {
      try { await loadProducts(); } catch (e) {}
    }
    ProductTable.renderProducts();
  } else if (targetId === 'tab-recipes') {
    resetRecipeFilters();
    Recipes.renderRecipes();
  }
  APP.activeTab = targetId;
}

function mountNavigation() {
  document.querySelectorAll('[data-tab-target]').forEach(tab => {
    tab.addEventListener('click', async () => {
      const target = tab.dataset.tabTarget;
      if (target === APP.activeTab) return;
      await activateTab(target);
      localStorage.setItem('activeTab', target);
      history.pushState({ tab: target }, '');
    }, { once: false });
  });
  const initial = localStorage.getItem('activeTab') || 'tab-products';
  history.replaceState({ tab: initial }, '');
  window.addEventListener('popstate', async e => {
    const target = e.state?.tab || 'tab-products';
    await activateTab(target);
    localStorage.setItem('activeTab', target);
  });
}

window.addEventListener('pageshow', e => {
  if (e.persisted) {
    const target = localStorage.getItem('activeTab') || 'tab-products';
    if (target === 'tab-products') {
      resetProductFilters();
      ProductTable.renderProducts();
    }
  }
});

window.activateTab = activateTab;
window.addToShoppingList = Shopping.addToShoppingList;

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

  const levelWrap = document.createElement('div');
  levelWrap.className = 'flex gap-2 hidden';
  ['none', 'low', 'medium', 'high'].forEach(l => {
    const label = document.createElement('label');
    label.className = 'cursor-pointer flex items-center gap-1';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'level';
    input.value = l;
    if (l === 'high') input.checked = true;
    const span = document.createElement('span');
    span.dataset.i18n = `level.${l}`;
    span.textContent = t(`level.${l}`);
    label.append(input, span);
    levelWrap.appendChild(label);
  });
  unitSel.insertAdjacentElement('afterend', levelWrap);

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

  function syncSpiceUI() {
    const isSp = catSelect.value === 'spices';
    qtyInput.classList.toggle('hidden', isSp);
    unitSel.classList.toggle('hidden', isSp);
    levelWrap.classList.toggle('hidden', !isSp);
    if (mainLabel) mainLabel.classList.toggle('hidden', isSp);
  }
  catSelect.addEventListener('change', syncSpiceUI);
  syncSpiceUI();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const category = data.get('category');
    const payload = {
      name: (data.get('name') || '').trim(),
      category,
      storage: data.get('storage')
    };
    if (category === 'spices') {
      payload.level = data.get('level') || 'none';
      payload.is_spice = true;
      payload.main = true;
      payload.quantity = 0;
      payload.unit = 'szt';
    } else {
      payload.quantity = parseFloat(data.get('quantity')) || 0;
      payload.unit = data.get('unit');
      payload.main = data.get('main') === 'on';
      const thr = parseFloat(data.get('threshold'));
      if (!isNaN(thr)) payload.threshold = thr;
    }
    submitBtn.disabled = true;
    try {
      await fetchJson('/api/products', { method: 'POST', body: payload });
      await loadProducts();
      ProductTable.renderProducts();
      Shopping.renderShoppingList();
      form.reset();
      syncSpiceUI();
      nameInput.focus();
      const container = document.getElementById('notification-container');
      if (container) {
        container.classList.remove('toast-end', 'top-auto', 'bottom-[4.5rem]');
        container.classList.add('toast-center', 'top-[4.5rem]', 'bottom-auto');
      }
      toast.success(t('product_added'));
      setTimeout(() => {
        if (container) {
          container.classList.remove('toast-center', 'top-[4.5rem]', 'bottom-auto');
          container.classList.add('toast-end', 'top-auto', 'bottom-[4.5rem]');
        }
      }, 5000);
    } catch (err) {
      showNotification({ type: 'error', title: t('save_failed'), message: err.status || err.message });
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
    const level = r.querySelector('.qty-cell input[type="radio"]:checked')?.value || orig.level;
    const qtyInput = r.querySelector('.qty-cell input[type="number"]');
    const qty = qtyInput ? parseFloat(qtyInput.value) || 0 : 0;
    const unit = r.querySelector('.unit-cell select')?.value || orig.unit;
    const cat = r.querySelector('.category-cell select')?.value || orig.category;
    const stor = r.querySelector('.storage-cell select')?.value || orig.storage;
    if (isSpice(orig)) {
      if (level !== orig.level || cat !== orig.category || stor !== orig.storage) {
        updates.push({ ...orig, level, category: cat, storage: stor });
      }
    } else if (qty !== orig.quantity || unit !== orig.unit || cat !== orig.category || stor !== orig.storage) {
      updates.push({ ...orig, quantity: qty, unit, category: cat, storage: stor });
    }
  });
  if (!updates.length) return true;
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  try {
    await fetchJson('/api/products', {
      method: 'PUT',
      body: updates
    });
    showNotification({ type: 'success', title: t('save_success') });
    return true;
  } catch (err) {
    showNotification({ type: 'error', title: t('save_failed'), message: err.status || err.message });
    return false;
  } finally {
    btn.disabled = false;
  }
}

function initNavigationAndEvents() {
  ProductTable.bindProductEvents();
  Recipes.bindRecipeEvents();
  mountNavigation();
  Shopping.renderShoppingList();
  initReceiptImport();
  initAddForm();

  const langBtn = document.getElementById('lang-toggle');
  const localeChip = document.getElementById('locale-chip');
  if (localeChip) {
    localeChip.textContent = state.currentLang.toUpperCase();
  }
  langBtn.addEventListener('click', () => {
    const scroll = window.scrollY;
    state.currentLang = state.currentLang === 'pl' ? 'en' : 'pl';
    localStorage.setItem('lang', state.currentLang);
    if (localeChip) {
      localeChip.textContent = state.currentLang.toUpperCase();
    }
    document.documentElement.setAttribute('lang', state.currentLang);
    applyTranslations();
    ProductTable.renderProducts();
    Recipes.renderRecipes();
    Shopping.renderShoppingList();
    Shopping.renderSuggestions();
    updateAriaLabels();
    const unitSel = document.querySelector('#add-form select[name="unit"]');
    if (unitSel) {
      Array.from(unitSel.options).forEach(opt => {
        opt.textContent = t(opt.value);
      });
    }
    window.scrollTo(0, scroll);
  });

  const themeBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  function updateThemeUI() {
    const current = localStorage.getItem('theme') || 'system';
    const icons = { light: 'fa-sun', dark: 'fa-moon', system: 'fa-desktop' };
    if (themeIcon) {
      themeIcon.className = `fa-solid ${icons[current]}`;
    }
    themeBtn?.setAttribute('aria-label', `Theme: ${current}`);
  }
  themeBtn?.addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'system';
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    window.setTheme(next);
    updateThemeUI();
  });
  updateThemeUI();

  const editBtn = document.getElementById('edit-toggle');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-selected');
  const selectHeader = document.getElementById('select-header');
  const addSection = document.getElementById('add-section');
  function enterEditMode() {
    APP.editBackup = JSON.parse(JSON.stringify(APP.state.products));
    APP.state.editing = true;
    editBtn.textContent = t('edit_mode_button_off');
    saveBtn.style.display = '';
    deleteBtn.style.display = '';
    deleteBtn.disabled = true;
    deleteBtn.textContent = t('delete_selected_button');
    selectHeader.style.display = '';
    if (addSection) addSection.style.display = '';
    ProductTable.renderProducts();
    updateAriaLabels();
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
    if (addSection) addSection.style.display = 'none';
    ProductTable.renderProducts();
    updateAriaLabels();
  }

  editBtn?.addEventListener('click', () => {
    if (APP.state.editing) exitEditMode(true);
    else enterEditMode();
  });

  saveBtn?.addEventListener('click', async () => {
    const ok = await saveEdits();
    if (ok) {
      await ProductTable.refreshProducts();
      exitEditMode(false);
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    const checked = Array.from(document.querySelectorAll('.product-select:checked'));
    if (!checked.length) return;
    const names = [...new Set(checked.map(cb => cb.dataset.name))];
    if (!confirm(t('delete_modal_question'))) return;
    deleteBtn.disabled = true;
    try {
      await Promise.allSettled(
        names.map(n => fetchJson(`/api/products/${encodeURIComponent(n)}`, { method: 'DELETE' }))
      );
      await loadProducts();
      exitEditMode(false);
    } catch (err) {
      showNotification({ type: 'error', title: t('notify_error_title'), message: err.status || err.message });
    } finally {
      const selected = document.querySelectorAll('.product-select:checked').length;
      deleteBtn.disabled = selected === 0;
      deleteBtn.textContent =
        selected > 0
          ? `${t('delete_selected_button')} (${selected})`
          : t('delete_selected_button');
    }
  });

  const viewBtn = document.getElementById('view-toggle');
  viewBtn?.addEventListener('click', () => {
    if (APP.state.editing) exitEditMode(true);
    APP.state.view = APP.state.view === 'flat' ? 'grouped' : 'flat';
    viewBtn.textContent = APP.state.view === 'grouped' ? t('change_view_toggle_flat') : t('change_view_toggle_grouped');
    ProductTable.renderProducts();
    updateAriaLabels();
  });
  const filterSel = document.getElementById('state-filter');
  filterSel?.addEventListener('change', () => {
    APP.state.filter = filterSel.value;
    ProductTable.renderProducts();
  });
  const filterSelMobile = document.getElementById('state-filter-mobile');
  filterSelMobile?.addEventListener('change', () => {
    APP.state.filter = filterSelMobile.value;
    ProductTable.renderProducts();
  });
  const searchInput = document.getElementById('product-search');
  searchInput?.addEventListener(
    'input',
    debounce(() => {
      APP.state.search = searchInput.value.trim().toLowerCase();
      ProductTable.renderProducts();
    }, 150)
  );
  const searchInputMobile = document.getElementById('product-search-mobile');
  searchInputMobile?.addEventListener(
    'input',
    debounce(() => {
      APP.state.search = searchInputMobile.value.trim().toLowerCase();
      ProductTable.renderProducts();
    }, 150)
  );
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

  function updateAriaLabels() {
    viewBtn?.setAttribute('aria-label', t(APP.state.view === 'grouped' ? 'change_view_toggle_flat' : 'change_view_toggle_grouped'));
    viewBtn?.setAttribute('aria-pressed', APP.state.view === 'grouped');
    editBtn?.setAttribute('aria-label', t(APP.state.editing ? 'edit_mode_button_off' : 'edit_mode_button_on'));
    editBtn?.setAttribute('aria-pressed', APP.state.editing);
    saveBtn?.setAttribute('aria-label', t('save_button'));
    deleteBtn?.setAttribute('aria-label', t('delete_selected_button'));
    document.getElementById('confirm-delete')?.setAttribute('aria-label', t('delete_confirm_button'));
    document.getElementById('cancel-delete')?.setAttribute('aria-label', t('delete_cancel_button'));
    document.getElementById('confirm-remove-item')?.setAttribute('aria-label', t('confirm_button'));
    document.querySelector('#shopping-delete-modal .btn-outline')?.setAttribute('aria-label', t('delete_cancel_button'));
    document.getElementById('history-detail-close')?.setAttribute('aria-label', t('close'));
    document.getElementById('manual-dec')?.setAttribute('aria-label', t('decrease_quantity'));
    document.getElementById('manual-inc')?.setAttribute('aria-label', t('increase_quantity'));
  }

  updateAriaLabels();
}

function initialRender() {
  APP.state.view = 'grouped';
  resetProductFilters();
  activateTab('tab-products');
}

async function boot() {
  trace('boot:start');
  await loadTranslations();
  trace('i18n');
  await loadDomain();
  trace('domain');
  applyTranslations();
  document.documentElement.setAttribute('lang', state.currentLang);
  await loadFavorites();
  trace('favorites');
  await loadHistory();
  trace('history');
  initNavigationAndEvents();
  trace('events');
  initialRender();
  trace('render');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    trace('DOMContentLoaded');
    await boot();
    trace('boot:done');
    registerServiceWorker();
  } catch (e) {
    console.error(e);
    showTopBanner(t('init_failed'), { actionLabel: t('retry'), onAction: () => location.reload() });
  }
});
