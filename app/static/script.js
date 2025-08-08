import { loadTranslations, loadUnits, loadFavorites, state } from './js/helpers.js';
import { renderProducts } from './js/components/product-table.js';
import { renderRecipes, loadRecipes } from './js/components/recipe-list.js';
import { renderShoppingList, addToShoppingList } from './js/components/shopping-list.js';
import { showNotification, checkLowStockToast } from './js/components/toast.js';
import { initReceiptImport } from './js/components/ocr-modal.js';

let currentProducts = [];

async function loadProducts() {
  const res = await fetch('/api/products');
  currentProducts = await res.json();
  window.currentProducts = currentProducts;
  renderProducts(currentProducts);
  checkLowStockToast(currentProducts, activateTab, () => {}, renderShoppingList);
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
});
