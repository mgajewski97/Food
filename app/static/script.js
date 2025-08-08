import { loadTranslations, loadUnits, loadFavorites, state, t } from './js/helpers.js';
import { renderProducts } from './js/components/product-table.js';
import { renderRecipes, loadRecipes } from './js/components/recipe-list.js';
import { renderShoppingList, addToShoppingList, renderSuggestions } from './js/components/shopping-list.js';
import { showNotification, checkLowStockToast } from './js/components/toast.js';
import { initReceiptImport } from './js/components/ocr-modal.js';

let currentProducts = [];
let editMode = false;

async function loadProducts() {
  const res = await fetch('/api/products');
  currentProducts = await res.json();
  window.currentProducts = currentProducts;
  renderProducts(currentProducts, editMode);
  renderSuggestions();
  checkLowStockToast(currentProducts, activateTab, renderSuggestions, renderShoppingList);
}

function activateTab(targetId) {
  document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
  const tab = document.querySelector(`[data-tab-target="${targetId}"]`);
  if (tab) tab.classList.add('tab-active', 'font-bold');
  document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
  const panel = document.getElementById(targetId);
  if (panel) panel.style.display = 'block';
}

window.activateTab = activateTab;
window.addToShoppingList = addToShoppingList;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  await loadUnits();
  await loadFavorites();
  renderShoppingList();
  initReceiptImport();
  loadProducts();
  loadRecipes();
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
