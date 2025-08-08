import { loadTranslations, loadUnits, loadFavorites, state, t, normalizeProduct } from './js/helpers.js';
import { renderProducts } from './js/components/product-table.js';
import { renderRecipes, loadRecipes } from './js/components/recipe-list.js';
import { renderShoppingList, addToShoppingList, renderSuggestions } from './js/components/shopping-list.js';
import { showNotification, checkLowStockToast } from './js/components/toast.js';
import { initReceiptImport } from './js/components/ocr-modal.js';

// CHANGELOG:
// - Refactored app boot sequence for deterministic init and fail-soft data loading.
// - Added retry-capable fetch helpers and mounted navigation before data fetching.

let currentProducts = [];
let editMode = false;

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentProducts = data.map(normalizeProduct);
    window.currentProducts = currentProducts;
    renderProducts(currentProducts, editMode);
    renderSuggestions();
    checkLowStockToast(currentProducts, activateTab, renderSuggestions, renderShoppingList);
  } catch (err) {
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

function activateTab(targetId) {
  document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
  const tab = document.querySelector(`[data-tab-target="${targetId}"]`);
  if (tab) tab.classList.add('tab-active', 'font-bold');
  document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
  const panel = document.getElementById(targetId);
  if (panel) panel.style.display = 'block';
}

function mountNavigation() {
  document.querySelectorAll('[data-tab-target]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tabTarget;
      activateTab(target);
      localStorage.setItem('activeTab', target);
    });
  });
  const initial = localStorage.getItem('activeTab') || 'tab-products';
  activateTab(initial);
}

window.activateTab = activateTab;
window.addToShoppingList = addToShoppingList;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  await loadUnits();
  mountNavigation();
  await loadFavorites();
  renderShoppingList();
  initReceiptImport();
  await Promise.all([fetchProducts(), fetchRecipes(), fetchHistory()]);
  const editBtn = document.getElementById('edit-toggle');
  const saveBtn = document.getElementById('save-btn');
  const deleteBtn = document.getElementById('delete-selected');
  const selectHeader = document.getElementById('select-header');
  editBtn?.addEventListener('click', () => {
    editMode = !editMode;
    editBtn.textContent = editMode ? t('edit_mode_button_off') : t('edit_mode_button_on');
    saveBtn.style.display = editMode ? '' : 'none';
    deleteBtn.style.display = editMode ? '' : 'none';
    selectHeader.style.display = editMode ? '' : 'none';
    renderProducts(currentProducts, editMode);
  });
});
