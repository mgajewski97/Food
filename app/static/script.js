let groupedView = false;
let editMode = false;
let currentFilter = 'available';
let pendingDelete = [];
let currentLang = localStorage.getItem('lang') || 'pl';
let UNIT = '';
const LOW_STOCK_CLASS = 'text-error bg-error/10';
let lowStockToastShown = false;

let shoppingList = JSON.parse(localStorage.getItem('shoppingList') || '[]');
let pendingRemoveIndex = null;
let currentRecipeName = null;
let currentRecipeSort = 'name';
let cookingState = { recipe: null, step: 0 };
let touchStartX = 0;
let cornerIconsTop = true;

let uiTranslations = { pl: {}, en: {} };
let translations = { products: {} };
let units = {};

const html = document.documentElement;
const layoutIcon = document.getElementById('layout-icon');
const cornerIcons = document.querySelector('.corner-icons');
const topSentinel = document.getElementById('top-sentinel');

function updateCornerIconsVisibility() {
  if (!cornerIcons) return;
  if (html.getAttribute('data-layout') === 'mobile') {
    cornerIcons.style.display = cornerIconsTop ? 'flex' : 'none';
  } else {
    cornerIcons.style.display = 'flex';
  }
}
let state = {
  displayMode: html.getAttribute('data-layout') || 'desktop',
  expandedStorages: {},
  expandedCategories: {}
};

function setDisplayMode(mode) {
  state.displayMode = mode;
  html.setAttribute('data-layout', mode);
  if (layoutIcon) {
    layoutIcon.className = mode === 'desktop' ? 'fa-regular fa-mobile' : 'fa-solid fa-desktop';
  }
  updateCornerIconsVisibility();
}

function detectInitialDisplayMode() {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile && state.displayMode === 'desktop') {
    setDisplayMode('mobile');
  } else if (!isMobile && state.displayMode === 'mobile') {
    setDisplayMode('desktop');
  }
}

detectInitialDisplayMode();
updateCornerIconsVisibility();

if (topSentinel && cornerIcons) {
  const observer = new IntersectionObserver(
    entries => {
      cornerIconsTop = entries[0].intersectionRatio === 1;
      updateCornerIconsVisibility();
    },
    { threshold: [0, 1] }
  );
  observer.observe(topSentinel);
}

async function loadTranslations() {
  try {
    const [plRes, enRes] = await Promise.all([
      fetch('/static/translations/pl.json'),
      fetch('/static/translations/en.json')
    ]);
    const pl = await plRes.json();
    const en = await enRes.json();
    uiTranslations.pl = pl;
    uiTranslations.en = en;
    translations.products = {};
    Object.entries(pl).forEach(([k, v]) => {
      if (k.startsWith('product.')) {
        const key = k.slice('product.'.length);
        translations.products[key] = { pl: v, en: en[k] || '(no translation)' };
      }
    });
  } catch (err) {
    console.error('Failed to load translations', err);
    uiTranslations = { pl: {}, en: {} };
    translations = { products: {} };
  }
}

async function loadUnits() {
  try {
    const res = await fetch('/api/units');
    units = await res.json();
  } catch (err) {
    console.error('Failed to load units', err);
    units = {};
  }
}

const CATEGORY_KEYS = {
  uncategorized: 'category_uncategorized',
  fresh_veg: 'category_fresh_veg',
  mushrooms: 'category_mushrooms',
  dairy_eggs: 'category_dairy_eggs',
  opened_preserves: 'category_opened_preserves',
  ready_sauces: 'category_ready_sauces',
  dry_veg: 'category_dry_veg',
  bread: 'category_bread',
  pasta: 'category_pasta',
  rice: 'category_rice',
  grains: 'category_grains',
  dried_legumes: 'category_dried_legumes',
  sauces: 'category_sauces',
  oils: 'category_oils',
  spreads: 'category_spreads',
  frozen_veg: 'category_frozen_veg',
  frozen_sauces: 'category_frozen_sauces',
  frozen_meals: 'category_frozen_meals'
};

const STORAGE_KEYS = {
  fridge: 'storage_fridge',
  pantry: 'storage_pantry',
  freezer: 'storage_freezer'
};

const STORAGE_ICONS = {
  fridge: '🧊',
  pantry: '🏠',
  freezer: '❄️'
};

function t(id) {
  return uiTranslations[currentLang][id] || '(no translation)';
}

function productName(key) {
  if (!key || !key.startsWith('product.')) return key;
  const k = key.slice('product.'.length);
  const entry = translations.products[k];
  return entry ? entry[currentLang] || '(no translation)' : '(no translation)';
}

function unitName(key) {
  if (!key) return key;
  const entry = units[key];
  return entry ? entry[currentLang] || '(no translation)' : key;
}

function renderUnitsAdmin() {
  const tbody = document.querySelector('#units-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(units).forEach(([code, names]) => {
    const tr = document.createElement('tr');
    tr.dataset.code = code;

    const codeTd = document.createElement('td');
    codeTd.className = 'w-1/3 align-middle text-center';
    codeTd.textContent = code;
    tr.appendChild(codeTd);

    const plTd = document.createElement('td');
    plTd.className = 'w-1/3 align-middle text-center';
    const plInput = document.createElement('input');
    plInput.value = names.pl || '';
    plInput.className = 'input input-bordered w-full text-center';
    plTd.appendChild(plInput);
    tr.appendChild(plTd);

    const enTd = document.createElement('td');
    enTd.className = 'w-1/3 align-middle text-center';
    const enInput = document.createElement('input');
    enInput.value = names.en || '';
    enInput.className = 'input input-bordered w-full text-center';
    enTd.appendChild(enInput);
    tr.appendChild(enTd);

    tbody.appendChild(tr);
  });
}

async function saveUnitsFromAdmin() {
  const tbody = document.querySelector('#units-table tbody');
  if (!tbody) return;
  const updated = {};
  tbody.querySelectorAll('tr').forEach(tr => {
    const code = tr.dataset.code;
    const [plInput, enInput] = tr.querySelectorAll('input');
    updated[code] = { pl: plInput.value.trim(), en: enInput.value.trim() };
  });
  await fetch('/api/units', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated)
  });
  units = updated;
  renderUnitsAdmin();
  renderProducts(getFilteredProducts());
  renderShoppingList();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = text;
    } else if (el.tagName === 'OPTION') {
      el.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

function categoryName(key) {
  return t(CATEGORY_KEYS[key]) || key;
}

function storageName(key) {
  return t(STORAGE_KEYS[key]) || key;
}

function formatQuantity(p) {
  const packages = p.quantity;
  const units = packages * (p.package_size || 1);
  if ((p.package_size || 1) !== 1) {
    return `${packages} op. (${units} ${unitName(p.unit)})`;
  }
  return `${units} ${unitName(p.unit)}`;
}

function formatPackQuantity(p) {
  if (p.pack_size) {
    const total = Math.ceil(p.quantity / p.pack_size) * p.pack_size;
    return `${p.quantity} z ${total}`;
  }
  return p.quantity;
}

function getStatusIcon(p) {
  if (p.main) {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: t('status_missing') };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-500"></i>', title: t('status_low') };
    }
  } else {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: t('status_missing') };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-300"></i>', title: t('status_low') };
    }
  }
  return null;
}

function sortProducts(list) {
  return list.sort((a, b) => {
    const storA = storageName(a.storage);
    const storB = storageName(b.storage);
    const storCmp = storA.localeCompare(storB);
    if (storCmp !== 0) return storCmp;
    const catA = categoryName(a.category);
    const catB = categoryName(b.category);
    const catCmp = catA.localeCompare(catB);
    if (catCmp !== 0) return catCmp;
    return productName(a.name).localeCompare(productName(b.name));
  });
}

function showLowStockToast() {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.innerHTML = '';
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning relative';
  const span = document.createElement('span');
  span.textContent = t('toast_low_stock');
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm ml-4';
  btn.dataset.action = 'shopping';
  btn.textContent = t('toast_go_shopping');
  btn.addEventListener('click', () => {
    activateTab('tab-shopping');
    localStorage.setItem('activeTab', 'tab-shopping');
    renderSuggestions();
    renderShoppingList();
    container.innerHTML = '';
  });
  const close = document.createElement('button');
  close.className = 'btn btn-xs btn-circle btn-ghost absolute top-1 right-1';
  close.dataset.action = 'close';
  close.setAttribute('title', t('toast_close'));
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener('click', () => {
    container.innerHTML = '';
  });
  alert.appendChild(span);
  alert.appendChild(btn);
  alert.appendChild(close);
  container.appendChild(alert);
}

function checkLowStockToast() {
  const low = (window.currentProducts || []).some(p => p.main && p.threshold !== null && p.quantity <= p.threshold);
  const container = document.getElementById('toast-container');
  if (low) {
    if (!lowStockToastShown) {
      lowStockToastShown = true;
      showLowStockToast();
    } else if (container && container.childElementCount) {
      container.querySelector('span').textContent = t('toast_low_stock');
      const btn = container.querySelector('button[data-action="shopping"]');
      if (btn) btn.textContent = t('toast_go_shopping');
      const close = container.querySelector('button[data-action="close"]');
      if (close) close.setAttribute('title', t('toast_close'));
    }
  }
}

  document.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();
    await loadUnits();
    document.documentElement.setAttribute('lang', currentLang);
    UNIT = 'szt';
    applyTranslations();
    updateThemeToggleLabel();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js');
    }
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    }
  const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
      langBtn.textContent = currentLang.toUpperCase();
      langBtn.addEventListener('click', async () => {
        currentLang = currentLang === 'pl' ? 'en' : 'pl';
        localStorage.setItem('lang', currentLang);
        langBtn.textContent = currentLang.toUpperCase();
        const active = document.querySelector('[data-tab-target].tab-active');
        const activeTarget = active ? active.dataset.tabTarget : null;
        document.documentElement.setAttribute('lang', currentLang);
        UNIT = 'szt';
        applyTranslations();
        updateThemeToggleLabel();
        renderUnitsAdmin();
        if (activeTarget) {
          document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
          const panel = document.getElementById(activeTarget);
          if (panel) panel.style.display = 'block';
        }
        renderProducts(getFilteredProducts());
        loadRecipes();
        loadHistory();
        renderSuggestions();
        renderShoppingList();
        checkLowStockToast();
      });
    }

    const initialTab = localStorage.getItem('activeTab') || 'tab-products';
    activateTab(initialTab);
    await loadProducts();
    if (initialTab === 'tab-recipes') {
      loadRecipes();
    } else if (initialTab === 'tab-history') {
      loadHistory();
    } else if (initialTab === 'tab-settings') {
      renderUnitsAdmin();
    }

  document.querySelectorAll('[data-tab-target]').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tabTarget;
      activateTab(targetId);
      localStorage.setItem('activeTab', targetId);
      if (targetId === 'tab-products') {
        loadProducts();
      } else if (targetId === 'tab-recipes') {
        loadRecipes();
      } else if (targetId === 'tab-history') {
        loadHistory();
      } else if (targetId === 'tab-shopping') {
        renderSuggestions();
        renderShoppingList();
      } else if (targetId === 'tab-settings') {
        renderUnitsAdmin();
      }
    });
  });

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      activateTab('tab-settings');
      localStorage.setItem('activeTab', 'tab-settings');
      renderUnitsAdmin();
    });
  }

  const saveUnitsBtn = document.getElementById('units-save');
  if (saveUnitsBtn) {
    saveUnitsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveUnitsFromAdmin();
    });
  }

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const pkgSize = parseFloat(form.package_size.value) || 1;
    const packSize = form.pack_size.value ? parseInt(form.pack_size.value, 10) : null;
    const inputName = form.name.value.trim();
    let nameKey = inputName;
    const opt = Array.from(document.querySelectorAll('#product-datalist option')).find(o => o.value === inputName);
    if (opt) nameKey = opt.dataset.key;
    const product = {
      name: form.name.value,
      quantity: parseFloat(form.quantity.value) / pkgSize,
      category: form.category.value,
      storage: form.storage.value,
      threshold: form.threshold.value ? parseFloat(form.threshold.value) : null,
      main: form.main.checked,
      unit: UNIT,
      package_size: pkgSize,
      pack_size: packSize
    };
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    form.reset();
    await loadProducts();
    await loadRecipes();
  });

  document.getElementById('copy-btn').addEventListener('click', () => {
    const lines = [t('clipboard_header_products')];
    (window.currentProducts || []).forEach(p => {
      const units = p.quantity * (p.package_size || 1);
      lines.push(`- ${productName(p.name)}: ${units} ${unitName(p.unit)}`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
  });

  const ratingForm = document.getElementById('rating-form');
  const ratingModal = document.getElementById('rating-modal');
  if (ratingForm && ratingModal) {
    setupStarRatings(ratingForm);
    ratingForm.addEventListener('submit', handleRatingSubmit);
    document.getElementById('rating-cancel').addEventListener('click', () => ratingModal.close());
  }
  const recipeSort = document.getElementById('recipe-sort');
  if (recipeSort) {
    recipeSort.addEventListener('change', e => {
      currentRecipeSort = e.target.value;
      loadRecipes();
    });
  }
  document.getElementById('view-toggle').addEventListener('click', () => {
    if (editMode) {
      editMode = false;
      document.getElementById('edit-toggle').textContent = t('edit_mode_button_on');
      document.getElementById('save-btn').style.display = 'none';
      document.getElementById('delete-selected').style.display = 'none';
      document.getElementById('select-header').style.display = 'none';
    }
    groupedView = !groupedView;
    document.getElementById('product-table').style.display = groupedView ? 'none' : 'table';
    document.getElementById('product-list').style.display = groupedView ? 'block' : 'none';
    document.getElementById('view-toggle').textContent = groupedView ? t('change_view_toggle_flat') : t('change_view_toggle_grouped');
    renderProducts(getFilteredProducts());
  });
  document.getElementById('edit-toggle').addEventListener('click', async () => {
    editMode = !editMode;
    document.getElementById('edit-toggle').textContent = editMode ? t('edit_mode_button_off') : t('edit_mode_button_on');
    document.getElementById('save-btn').style.display = editMode ? 'inline-block' : 'none';
    document.getElementById('delete-selected').style.display = editMode ? 'inline-block' : 'none';
    document.getElementById('select-header').style.display = editMode ? 'table-cell' : 'none';
    if (!editMode) {
      await loadProducts();
    } else {
      renderProducts(getFilteredProducts());
    }
    updateDeleteButton();
  });

  document.getElementById('delete-selected').addEventListener('click', () => {
    const data = getFilteredProducts();
    const rows = Array.from(document.querySelectorAll('#product-table tbody tr'));
    const names = [];
    rows.forEach((tr, idx) => {
      const cb = tr.querySelector('.row-select');
      if (cb && cb.checked) {
        names.push(data[idx].name);
      }
    });
    pendingDelete = names;
    const summary = document.getElementById('delete-summary');
    summary.innerHTML = names.map(n => `<div>${productName(n)}</div>`).join('');
    document.getElementById('delete-modal').showModal();
  });

  document.getElementById('confirm-delete').addEventListener('click', async () => {
    for (const name of pendingDelete) {
      await fetch(`/api/products/${encodeURIComponent(name)}`, { method: 'DELETE' });
    }
    document.getElementById('delete-modal').close();
    await loadProducts();
    updateDeleteButton();
  });

  document.getElementById('cancel-delete').addEventListener('click', () => {
    document.getElementById('delete-modal').close();
  });
  document.getElementById('save-btn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('#product-table tbody tr');
    const data = getFilteredProducts();
    const updates = [];
    rows.forEach((tr, idx) => {
      const nameInput = tr.querySelector('.edit-name');
      const qtyInput = tr.querySelector('.edit-qty');
      const unitInput = tr.querySelector('.edit-unit');
      const catSelect = tr.querySelector('.edit-category');
      const storSelect = tr.querySelector('.edit-storage');
      if (nameInput && qtyInput && unitInput && catSelect && storSelect) {
        const original = data[idx];
        const newName = nameInput.value.trim();
        const newQty = parseFloat(qtyInput.value) / (original.package_size || 1);
        const newUnit = unitInput.value.trim();
        const newCat = catSelect.value;
        const newStor = storSelect.value;
        const nameChanged = newName !== productName(original.name);
        const unitChanged = newUnit !== original.unit;
        const qtyChanged = newQty !== original.quantity;
        const catChanged = newCat !== original.category;
        const storChanged = newStor !== original.storage;
        if (nameChanged) {
          const key = original.name.slice('product.'.length);
          if (!translations.products[key]) translations.products[key] = {};
          translations.products[key][currentLang] = newName;
        }
        if (qtyChanged || unitChanged || catChanged || storChanged) {
          updates.push({
            originalName: original.name,
            updated: { ...original, name: original.name, quantity: newQty, unit: newUnit, category: newCat, storage: newStor }
          });
        }
      }
    });
    for (const u of updates) {
      await fetch(`/api/products/${encodeURIComponent(u.originalName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u.updated)
      });
    }
    editMode = false;
    document.getElementById('edit-toggle').textContent = t('edit_mode_button_on');
    document.getElementById('save-btn').style.display = 'none';
    document.getElementById('delete-selected').style.display = 'none';
    document.getElementById('select-header').style.display = 'none';
    await loadProducts();
    if (updates.length) {
      await loadRecipes();
    }
    updateDeleteButton();
  });
  document.getElementById('product-search').addEventListener('input', () => {
    renderProducts(getFilteredProducts());
  });
  const stateFilter = document.getElementById('state-filter');
  function setFilter(value) {
    currentFilter = value;
    if (stateFilter) stateFilter.value = value;
    renderProducts(getFilteredProducts());
  }
  if (stateFilter) {
    stateFilter.addEventListener('change', e => setFilter(e.target.value));
  }
  document.getElementById('edit-json-btn').addEventListener('click', async () => {
    const textarea = document.getElementById('edit-json');
    try {
      const payload = JSON.parse(textarea.value);
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      textarea.value = '';
      await loadProducts();
      await loadRecipes();
    } catch (err) {
      console.error(t('invalid_json_alert'));
    }
  });

  const manualQty = document.getElementById('manual-qty');
  const manualDec = document.getElementById('manual-dec');
  const manualInc = document.getElementById('manual-inc');
  if (manualDec && manualInc && manualQty) {
    manualDec.addEventListener('click', () => {
      const current = parseInt(manualQty.textContent) || 1;
      manualQty.textContent = Math.max(1, current - 1);
    });
    manualInc.addEventListener('click', () => {
      const current = parseInt(manualQty.textContent) || 1;
      manualQty.textContent = current + 1;
    });
  }
  const manualAddBtn = document.getElementById('manual-add-btn');
  if (manualAddBtn) manualAddBtn.addEventListener('click', handleManualAdd);

  const confirmRemove = document.getElementById('confirm-remove-item');
  const deleteModal = document.getElementById('shopping-delete-modal');
  if (confirmRemove && deleteModal) {
    confirmRemove.addEventListener('click', () => {
      if (pendingRemoveIndex !== null) {
        shoppingList.splice(pendingRemoveIndex, 1);
        pendingRemoveIndex = null;
        saveShoppingList();
        renderShoppingList();
        renderSuggestions();
      }
    });
    deleteModal.addEventListener('close', () => {
      pendingRemoveIndex = null;
    });
  }

  initReceiptImport();
});

async function loadProducts() {
  const res = await fetch('/api/products');
  const data = await res.json();
  window.currentProducts = sortProducts(data.map(p => {
    p.low_stock = p.threshold !== null && p.quantity <= p.threshold;
    p.package_size = p.package_size || 1;
    p.pack_size = p.pack_size || null;
    return p;
  }));
  renderProducts(getFilteredProducts());
  updateDatalist();
  renderSuggestions();
  renderShoppingList();
  checkLowStockToast();
}

function getFilteredProducts() {
  const query = document.getElementById('product-search').value.toLowerCase();
  return sortProducts((window.currentProducts || []).filter(p => {
    switch (currentFilter) {
      case 'missing':
        if (p.quantity !== 0) return false;
        break;
      case 'low':
        if (!(p.threshold !== null && p.quantity <= p.threshold)) return false;
        break;
      case 'all':
        break;
      case 'available':
      default:
        if (p.quantity <= 0) return false;
        break;
    }
    return productName(p.name).toLowerCase().includes(query);
  }));
}

function renderProducts(data) {
  const tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = '';
  document.getElementById('select-header').style.display = editMode ? 'table-cell' : 'none';
  data.forEach(p => {
    const tr = document.createElement('tr');
    tr.className =
      'bg-white border-b hover:bg-base-200 transition-colors duration-300';
    if (p.low_stock) {
      tr.className += ` ${LOW_STOCK_CLASS}`;
    }
    if (editMode) {
      const selectTd = document.createElement('td');
      selectTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'row-select checkbox';
      cb.addEventListener('change', updateDeleteButton);
      selectTd.appendChild(cb);
      tr.appendChild(selectTd);

      const nameTd = document.createElement('td');
      nameTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      const nameInput = document.createElement('input');
      nameInput.value = productName(p.name);
      nameInput.dataset.key = p.name;
      nameInput.className = 'edit-name input input-bordered w-full';
      nameTd.appendChild(nameInput);
      tr.appendChild(nameTd);

      const qtyTd = document.createElement('td');
      qtyTd.className = 'px-2 py-1 sm:px-4 sm:py-2 flex items-center';
      const decBtn = document.createElement('button');
      decBtn.textContent = '−';
      decBtn.className = 'btn btn-outline btn-xs';
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.value = p.quantity * (p.package_size || 1);
      qtyInput.className = 'edit-qty input input-bordered w-20 text-center mx-2 appearance-none';
      const incBtn = document.createElement('button');
      incBtn.textContent = '+';
      incBtn.className = 'btn btn-outline btn-xs';
      decBtn.addEventListener('click', () => {
        const current = parseFloat(qtyInput.value) || 0;
        qtyInput.value = Math.max(0, current - 1);
      });
      incBtn.addEventListener('click', () => {
        const current = parseFloat(qtyInput.value) || 0;
        qtyInput.value = current + 1;
      });
      qtyTd.appendChild(decBtn);
      qtyTd.appendChild(qtyInput);
      qtyTd.appendChild(incBtn);
      tr.appendChild(qtyTd);

      const unitTd = document.createElement('td');
      unitTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      const unitInput = document.createElement('input');
      unitInput.value = p.unit;
      unitInput.className = 'edit-unit input input-bordered w-full';
      unitTd.appendChild(unitInput);
      tr.appendChild(unitTd);

      const catTd = document.createElement('td');
      catTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      const catSelect = document.createElement('select');
      catSelect.className = 'edit-category select select-bordered';
      Object.entries(CATEGORY_KEYS).forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = t(key);
        if (val === p.category) opt.selected = true;
        catSelect.appendChild(opt);
      });
      catTd.appendChild(catSelect);
      tr.appendChild(catTd);

      const storTd = document.createElement('td');
      storTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      const storSelect = document.createElement('select');
      storSelect.className = 'edit-storage select select-bordered';
      Object.entries(STORAGE_KEYS).forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = t(key);
        if (val === p.storage) opt.selected = true;
        storSelect.appendChild(opt);
      });
      storTd.appendChild(storSelect);
      tr.appendChild(storTd);

      const statusTd = document.createElement('td');
      statusTd.className = 'px-2 py-1 sm:px-4 sm:py-2 text-center';
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
    } else {
      const nameTd = document.createElement('td');
      nameTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      nameTd.textContent = productName(p.name);
      tr.appendChild(nameTd);

      const qtyTd = document.createElement('td');
      qtyTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      qtyTd.textContent = formatPackQuantity(p);
      if (p.pack_size) {
        qtyTd.title = t('pack_title');
      }
      tr.appendChild(qtyTd);

      const unitTd = document.createElement('td');
      unitTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      unitTd.textContent = unitName(p.unit);
      tr.appendChild(unitTd);

      const catTd = document.createElement('td');
      catTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      catTd.textContent = categoryName(p.category);
      tr.appendChild(catTd);

      const storTd = document.createElement('td');
      storTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
      storTd.textContent = storageName(p.storage);
      tr.appendChild(storTd);

      const statusTd = document.createElement('td');
      statusTd.className = 'px-2 py-1 sm:px-4 sm:py-2 text-center';
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
    }
    tbody.appendChild(tr);
  });
  updateDeleteButton();

  const container = document.getElementById('product-list');
  container.innerHTML = '';
  const storages = {};
  data.forEach(p => {
    const storage = p.storage || 'pantry';
    const cat = p.category || 'uncategorized';
    if (!storages[storage]) {
      storages[storage] = {};
    }
    if (!storages[storage][cat]) {
      storages[storage][cat] = [];
    }
    storages[storage][cat].push(p);
  });

  const storOrder = Object.keys(storages).sort((a, b) =>
    storageName(a).localeCompare(storageName(b))
  );
  storOrder.forEach((stor, storIndex) => {
    const storageBlock = document.createElement('div');
    storageBlock.className = 'storage-block border border-base-300 rounded-lg p-4 mb-4';
    storageBlock.id = `storage-${storIndex}`;

    const storageHeader = document.createElement('div');
    storageHeader.className = 'mb-2 rounded px-2';
    storageHeader.id = `storage-header-${storIndex}`;

    const h3 = document.createElement('h3');
    h3.className = 'text-2xl font-bold flex items-center gap-2';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${STORAGE_ICONS[stor] || ''} ${storageName(stor)}`;
    h3.appendChild(nameSpan);

    const storToggle = document.createElement('button');
    storToggle.type = 'button';
    storToggle.className = 'ml-2 text-xl inline-flex items-center self-center leading-none cursor-pointer bg-transparent border-0 p-0';
    const storIcon = document.createElement('i');
    storIcon.className = 'fa-regular fa-caret-up transition-transform';
    storToggle.appendChild(storIcon);
    storToggle.id = `storage-toggle-${storIndex}`;

    h3.appendChild(storToggle);
    storageHeader.appendChild(h3);
    storageBlock.appendChild(storageHeader);

    const storageContent = document.createElement('div');
    storageContent.className = 'mt-2';
    storageBlock.appendChild(storageContent);
    container.appendChild(storageBlock);

    if (state.expandedStorages[stor] === undefined) {
      state.expandedStorages[stor] = true;
    }
    let storOpen = state.expandedStorages[stor];

    const applyStorState = () => {
      const title = storOpen ? t('collapse') : t('expand');
      storToggle.title = title;
      storToggle.setAttribute('aria-label', title);
      storIcon.classList.toggle('fa-caret-up', storOpen);
      storIcon.classList.toggle('fa-caret-down', !storOpen);
      // Use v-show instead of v-if to preserve DOM state when hiding content. v-if fully removes elements from the DOM.
      storageContent.style.display = storOpen ? '' : 'none';
    };

    const toggleStorage = () => {
      storOpen = !storOpen;
      state.expandedStorages[stor] = storOpen;
      applyStorState();
    };

    applyStorState();

    storToggle.addEventListener('click', e => {
      e.stopPropagation();
      toggleStorage();
    });

    storageHeader.addEventListener('click', () => {
      const isMobile =
        document.documentElement.getAttribute('data-layout') === 'mobile';
      if (isMobile) {
        toggleStorage();
      }
    });

    const categories = storages[stor];
    Object.keys(categories)
      .sort((a, b) => categoryName(a).localeCompare(categoryName(b)))
      .forEach((cat, catIndex) => {
        if (!categories[cat].length) return;

        const categoryBlock = document.createElement('div');
        categoryBlock.className =
          'category-block border border-base-300 rounded mb-4';
        categoryBlock.id = `category-${storIndex}-${catIndex}`;

        const catHeader = document.createElement('div');
        catHeader.className = 'rounded px-2';
        const h4 = document.createElement('h4');
        h4.className = 'text-xl font-semibold flex items-center gap-2 m-0';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = categoryName(cat);
        h4.appendChild(titleSpan);

        const catBtn = document.createElement('button');
        catBtn.type = 'button';
        catBtn.className =
          'ml-2 text-lg inline-flex items-center self-center leading-none cursor-pointer bg-transparent border-0 p-0';
        const catIcon = document.createElement('i');
        catIcon.className = 'fa-regular fa-caret-up transition-transform';
        catBtn.appendChild(catIcon);
        const catInitialTitle = t('collapse');
        catBtn.title = catInitialTitle;
        catBtn.setAttribute('aria-label', catInitialTitle);
        h4.appendChild(catBtn);
        catHeader.appendChild(h4);
        categoryBlock.appendChild(catHeader);

        const catContent = document.createElement('div');
        catContent.className = 'category-content';

        const table = document.createElement('table');
        table.className = 'table table-zebra w-full';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        [
          t('table_header_name'),
          t('table_header_quantity'),
          t('table_header_unit'),
          t('table_header_status')
        ].forEach(text => {
          const th = document.createElement('th');
          th.className = 'px-2 py-1 sm:px-4 sm:py-2';
          th.textContent = text;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbodyCat = document.createElement('tbody');
        categories[cat]
          .sort((a, b) => productName(a.name).localeCompare(productName(b.name)))
          .forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'hover transition-colors duration-300 hover:bg-base-200';
            if (p.low_stock) {
              tr.classList.add(...LOW_STOCK_CLASS.split(' '));
            }
            const nameTd = document.createElement('td');
            nameTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
            nameTd.textContent = productName(p.name);
            tr.appendChild(nameTd);

            const qtyTd = document.createElement('td');
            qtyTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
            qtyTd.textContent = formatPackQuantity(p);
            if (p.pack_size) {
              qtyTd.title = t('pack_title');
            }
            tr.appendChild(qtyTd);

            const unitTd = document.createElement('td');
            unitTd.className = 'px-2 py-1 sm:px-4 sm:py-2';
            unitTd.textContent = unitName(p.unit);
            tr.appendChild(unitTd);

            const statusTd = document.createElement('td');
            statusTd.className = 'px-2 py-1 sm:px-4 sm:py-2 text-center';
            const status = getStatusIcon(p);
            if (status) {
              statusTd.innerHTML = status.html;
              statusTd.title = status.title;
            }
            tr.appendChild(statusTd);

            tbodyCat.appendChild(tr);
          });
        table.appendChild(tbodyCat);
        catContent.appendChild(table);
        categoryBlock.appendChild(catContent);
        storageContent.appendChild(categoryBlock);

        if (!state.expandedCategories[stor]) {
          state.expandedCategories[stor] = {};
        }
        if (state.expandedCategories[stor][cat] === undefined) {
          state.expandedCategories[stor][cat] = true;
        }
        let catOpen = state.expandedCategories[stor][cat];

        const applyCatState = () => {
          const title = catOpen ? t('collapse') : t('expand');
          catBtn.title = title;
          catBtn.setAttribute('aria-label', title);
          catIcon.classList.toggle('fa-caret-up', catOpen);
          catIcon.classList.toggle('fa-caret-down', !catOpen);
          // Use v-show instead of v-if to preserve DOM state when hiding content. v-if fully removes elements from the DOM.
          catContent.style.display = catOpen ? '' : 'none';
        };

        const toggleCat = () => {
          catOpen = !catOpen;
          state.expandedCategories[stor][cat] = catOpen;
          applyCatState();
        };

        applyCatState();

        catBtn.addEventListener('click', e => {
          e.stopPropagation();
          toggleCat();
        });

        catHeader.addEventListener('click', () => {
          const isMobile =
            document.documentElement.getAttribute('data-layout') === 'mobile';
          if (isMobile) {
            toggleCat();
          }
        });
      });
  });
}

function updateDeleteButton() {
  const btn = document.getElementById('delete-selected');
  if (!btn) return;
  const any = document.querySelectorAll('.row-select:checked').length > 0;
  btn.disabled = !any;
}

async function loadRecipes() {
  const [res, histRes] = await Promise.all([
    fetch('/api/recipes'),
    fetch('/api/history')
  ]);
  const data = await res.json();
  const history = await histRes.json();
  const ratingMap = {};
  history.forEach(h => {
    if (h.name && h.rating) {
      if (!ratingMap[h.name]) {
        ratingMap[h.name] = { taste: [], prep_time: [] };
      }
      if (h.rating.taste != null) ratingMap[h.name].taste.push(h.rating.taste);
      if (h.rating.prep_time != null) ratingMap[h.name].prep_time.push(h.rating.prep_time);
    }
  });
  data.forEach(r => {
    const ratings = ratingMap[r.name];
    r.avgTaste = ratings && ratings.taste.length
      ? ratings.taste.reduce((a, b) => a + b, 0) / ratings.taste.length
      : 0;
    r.avgPrepTime = ratings && ratings.prep_time.length
      ? ratings.prep_time.reduce((a, b) => a + b, 0) / ratings.prep_time.length
      : 0;
  });
  data.sort((a, b) => {
    if (currentRecipeSort === 'taste') return b.avgTaste - a.avgTaste;
    if (currentRecipeSort === 'time') return b.avgPrepTime - a.avgPrepTime;
    return a.name.localeCompare(b.name);
  });
  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  data.forEach(r => {
    const li = document.createElement('li');
    const avgText = (r.avgTaste || r.avgPrepTime)
      ? ` [${r.avgTaste.toFixed(1)}★, ${r.avgPrepTime.toFixed(1)}⏱]`
      : '';
    li.textContent = `${r.name}${avgText} (${r.ingredients.join(', ')})`;
    const doneBtn = document.createElement('button');
    doneBtn.textContent = t('recipe_done_button');
    doneBtn.addEventListener('click', () => openRatingModal(r));
    li.appendChild(doneBtn);
    const cookBtn = document.createElement('button');
    cookBtn.textContent = t('cooking_mode_button');
    cookBtn.addEventListener('click', () => openCookingMode(r));
    li.appendChild(cookBtn);
    list.appendChild(li);
  });
  const saved = JSON.parse(localStorage.getItem('cookingProgress') || '{}');
  if (saved.recipe) {
    const rec = data.find(r => r.name === saved.recipe);
    if (rec) openCookingMode(rec);
  }
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const data = await res.json();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  data.forEach(h => {
    const li = document.createElement('li');
    const star = h.favorite ? ' ★' : '';
    const followedText = h.followed_recipe_exactly ? t('yes') : t('no');
    let text = `${h.date} - ${h.name} (${t('label_followed_recipe')} ${followedText}`;
    if (!h.followed_recipe_exactly && h.comment) {
      text += `, ${h.comment}`;
    }
    text += ')';
    if (h.rating) {
      text += ` (${t('label_taste')} ${h.rating.taste}, ${t('label_prep_time')} ${h.rating.prep_time})`;
    }
    text += star;
    li.textContent = text;
    list.appendChild(li);
  });
}

function activateTab(targetId) {
  document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
  const tab = document.querySelector(`[data-tab-target="${targetId}"]`);
  if (tab) tab.classList.add('tab-active', 'font-bold');
  document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
  const panel = document.getElementById(targetId);
  if (panel) panel.style.display = 'block';
  if (targetId !== 'tab-history') {
    const overlay = document.getElementById('cooking-overlay');
    if (overlay) overlay.classList.add('hidden');
    const modal = document.getElementById('rating-modal');
    if (modal) modal.close();
  }
}

function openRatingModal(recipe) {
  activateTab('tab-history');
  loadHistory();
  currentRecipeName = recipe.name;
  const modal = document.getElementById('rating-modal');
  const title = document.getElementById('rating-title');
  if (title) title.textContent = `${t('rating_modal_title')} ${recipe.name}`;
  const form = document.getElementById('rating-form');
  if (form) form.reset();
  if (modal) modal.showModal();
}

function setupStarRatings(form) {
  const groups = form.querySelectorAll('.rating');
  groups.forEach(group => {
    group.dataset.current = '0';
    const stars = group.querySelectorAll('.star');
    const update = () => {
      const val = parseInt(group.dataset.current, 10);
      stars.forEach((star, idx) => {
        const active = idx < val;
        star.classList.toggle('fa-solid', active);
        star.classList.toggle('fa-regular', !active);
        star.classList.toggle('text-yellow-400', active);
        star.classList.toggle('text-base-300', !active);
      });
    };
    update();
    stars.forEach((star, idx) => {
      const val = idx + 1;
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, i) => {
          const active = i < val;
          s.classList.toggle('fa-solid', active);
          s.classList.toggle('fa-regular', !active);
          s.classList.toggle('text-yellow-400', active);
          s.classList.toggle('text-base-300', !active);
        });
      });
      star.addEventListener('mouseleave', () => {
        update();
      });
      star.addEventListener('click', () => {
        if (group.dataset.current === String(val)) {
          group.dataset.current = '0';
        } else {
          group.dataset.current = String(val);
        }
        update();
      });
    });
    group.addEventListener('mouseleave', () => update());
    form.addEventListener('reset', () => {
      group.dataset.current = '0';
      update();
    });
  });
}

async function handleRatingSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const tasteGroup = form.querySelector('.rating[data-name="taste"]');
  const timeGroup = form.querySelector('.rating[data-name="time"]');
  const taste = Number(tasteGroup?.dataset.current || 0);
  const time = Number(timeGroup?.dataset.current || 0);
  const comment = form.comment ? form.comment.value.trim() : null;
  const entry = {
    name: currentRecipeName,
    used_ingredients: {},
    followed_recipe_exactly: true,
    comment: comment || null,
    rating: {
      taste: taste,
      prep_time: time
    },
    favorite: false
  };
  await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
  form.reset();
  document.getElementById('rating-modal').close();
  await loadRecipes();
  await loadHistory();
}

function showCookingStep() {
  const stepEl = document.getElementById('cooking-step');
  const nextBtn = document.getElementById('cooking-next');
  const form = document.getElementById('cooking-form');
  const steps = (cookingState.recipe && cookingState.recipe.steps) || [];
  if (cookingState.step < steps.length) {
    stepEl.textContent = steps[cookingState.step];
    form.classList.add('hidden');
    nextBtn.classList.remove('hidden');
  } else {
    stepEl.textContent = t('cooking_end_title');
    nextBtn.classList.add('hidden');
    form.classList.remove('hidden');
  }
  localStorage.setItem('cookingProgress', JSON.stringify({ recipe: cookingState.recipe.name, step: cookingState.step }));
}

function openCookingMode(recipe) {
  activateTab('tab-history');
  loadHistory();
  cookingState.recipe = recipe;
  const saved = JSON.parse(localStorage.getItem('cookingProgress') || '{}');
  cookingState.step = saved.recipe === recipe.name ? saved.step || 0 : 0;
  const overlay = document.getElementById('cooking-overlay');
  overlay.classList.remove('hidden');
  showCookingStep();
}

async function handleCookingSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const tasteGroup = form.querySelector('.rating[data-name="taste"]');
  const timeGroup = form.querySelector('.rating[data-name="time"]');
  const taste = Number(tasteGroup?.dataset.current || 0);
  const time = Number(timeGroup?.dataset.current || 0);
  const comment = form.comment ? form.comment.value.trim() : null;
  const entry = {
    name: cookingState.recipe.name,
    used_ingredients: {},
    followed_recipe_exactly: true,
    comment: comment || null,
    rating: {
      taste: taste,
      prep_time: time
    },
    favorite: false
  };
  await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
  form.reset();
  document.getElementById('cooking-overlay').classList.add('hidden');
  localStorage.removeItem('cookingProgress');
  await loadRecipes();
  await loadHistory();
}

const cookingNext = document.getElementById('cooking-next');
if (cookingNext) {
  cookingNext.addEventListener('click', () => {
    cookingState.step++;
    showCookingStep();
  });
}
const cookingForm = document.getElementById('cooking-form');
if (cookingForm) {
  setupStarRatings(cookingForm);
  cookingForm.addEventListener('submit', handleCookingSubmit);
}
const cookingOverlay = document.getElementById('cooking-overlay');
if (cookingOverlay) {
  cookingOverlay.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  });
  cookingOverlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    if (dx < -50) {
      cookingState.step++;
      showCookingStep();
    }
  });
}

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
function updateThemeToggleLabel() {
  if (!themeToggle) return;
  const key = document.documentElement.getAttribute('data-theme') === 'dark' ? 'theme_light' : 'theme_dark';
  const label = t(key);
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('title', label);
}
if (themeToggle && themeIcon) {
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    themeIcon.className = 'fa-solid fa-circle-half-stroke';
    updateThemeToggleLabel();
  });
}

// Layout toggle
const layoutToggle = document.getElementById('layout-toggle');
if (layoutToggle && layoutIcon) {
  layoutToggle.addEventListener('click', () => {
    const next = state.displayMode === 'desktop' ? 'mobile' : 'desktop';
    setDisplayMode(next);
  });
}

function updateDatalist() {
  const datalist = document.getElementById('product-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  (window.currentProducts || []).forEach(p => {
    const option = document.createElement('option');
    option.value = productName(p.name);
    option.dataset.key = p.name;
    datalist.appendChild(option);
  });
}

function saveShoppingList() {
  localStorage.setItem('shoppingList', JSON.stringify(shoppingList));
}

function addToShoppingList(name, quantity = 1) {
  if (shoppingList.some(item => item.name === name)) return;
  shoppingList.push({ name, quantity, inCart: false });
  saveShoppingList();
  renderShoppingList();
}

function handleManualAdd() {
  const nameInput = document.getElementById('manual-name');
  const qtyDisplay = document.getElementById('manual-qty');
  let name = nameInput.value.trim();
  const qty = parseInt(qtyDisplay.textContent) || 1;
  if (!name) return;
  const opt = Array.from(document.querySelectorAll('#product-datalist option')).find(o => o.value.toLowerCase() === name.toLowerCase());
  if (opt) name = opt.dataset.key;
  addToShoppingList(name, qty);
  nameInput.value = '';
  qtyDisplay.textContent = '1';
  renderSuggestions();
  renderShoppingList();
}

function renderSuggestions() {
  const table = document.getElementById('suggestion-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  const existing = new Set(shoppingList.map(i => i.name.toLowerCase()));
  (window.currentProducts || []).forEach(p => {
    const needs = p.quantity === 0 || (p.threshold !== null && p.quantity <= p.threshold);
    if (!needs || existing.has(p.name.toLowerCase())) return;
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = productName(p.name);
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'flex items-center justify-center';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.textContent = '−';
    dec.className = 'btn btn-outline btn-xs';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = '1';
    qtyInput.className = 'input input-bordered w-16 text-center mx-2';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.textContent = '+';
    inc.className = 'btn btn-outline btn-xs';
    dec.addEventListener('click', () => {
      qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) - 1);
    });
    inc.addEventListener('click', () => {
      qtyInput.value = (parseInt(qtyInput.value) || 1) + 1;
    });
    qtyWrap.append(dec, qtyInput, inc);
    qtyTd.appendChild(qtyWrap);
    tr.appendChild(qtyTd);

    const acceptTd = document.createElement('td');
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'text-success text-xl';
    acceptBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    acceptBtn.setAttribute('aria-label', t('accept'));
    acceptBtn.addEventListener('click', () => {
      addToShoppingList(p.name, parseInt(qtyInput.value) || 1);
      renderSuggestions();
    });
    acceptTd.appendChild(acceptBtn);
    tr.appendChild(acceptTd);

    const rejectTd = document.createElement('td');
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'text-error text-xl';
    rejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    rejectBtn.setAttribute('aria-label', t('reject'));
    rejectBtn.addEventListener('click', () => tr.remove());
    rejectTd.appendChild(rejectBtn);
    tr.appendChild(rejectTd);

    tbody.appendChild(tr);
  });
}

function renderShoppingList() {
  const table = document.getElementById('shopping-list');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  shoppingList.sort((a, b) => {
    if (a.inCart && b.inCart) return (a.cartTime || 0) - (b.cartTime || 0);
    if (a.inCart !== b.inCart) return a.inCart ? 1 : -1;
    return productName(a.name).localeCompare(productName(b.name));
  });
  shoppingList.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'shopping-row';
    if (item.inCart) tr.classList.add('opacity-50', 'italic');

    const nameTd = document.createElement('td');
    nameTd.textContent = productName(item.name);
    if (item.inCart) nameTd.classList.add('line-through');
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'flex items-center justify-center gap-2 mx-2';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
    dec.className = 'touch-btn';
    dec.disabled = item.inCart;
    const qtyDisplay = document.createElement('span');
    qtyDisplay.textContent = item.quantity;
    qtyDisplay.className = 'w-8 text-center';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
    inc.className = 'touch-btn';
    inc.disabled = item.inCart;
    dec.addEventListener('click', () => {
      const newVal = Math.max(1, item.quantity - 1);
      item.quantity = newVal;
      qtyDisplay.textContent = newVal;
      saveShoppingList();
    });
    inc.addEventListener('click', () => {
      const newVal = item.quantity + 1;
      item.quantity = newVal;
      qtyDisplay.textContent = newVal;
      saveShoppingList();
    });
    qtyWrap.append(dec, qtyDisplay, inc);
    qtyTd.appendChild(qtyWrap);
    tr.appendChild(qtyTd);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'flex items-center justify-end gap-2';

    const cartBtn = document.createElement('button');
    cartBtn.type = 'button';
    cartBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
    cartBtn.className = (item.inCart ? 'text-success ' : 'text-gray-400 ') + 'touch-btn';
    cartBtn.setAttribute('aria-label', t('in_cart'));
    cartBtn.addEventListener('click', () => {
      item.inCart = !item.inCart;
      if (item.inCart) {
        item.cartTime = Date.now();
      } else {
        delete item.cartTime;
      }
      saveShoppingList();
      renderShoppingList();
    });
    actionsTd.appendChild(cartBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-error touch-btn';
    removeBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
    removeBtn.setAttribute('aria-label', t('remove'));
    removeBtn.addEventListener('click', () => {
      pendingRemoveIndex = idx;
      const modal = document.getElementById('shopping-delete-modal');
      if (modal) modal.showModal();
    });
    actionsTd.appendChild(removeBtn);

    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

function initReceiptImport() {
  const btn = document.getElementById('receipt-btn');
  const input = document.getElementById('receipt-input');
  const modal = document.getElementById('receipt-modal');
  const tableBody = document.querySelector('#receipt-table tbody');
  const confirm = document.getElementById('receipt-confirm');
  if (!btn || !modal || !input || !tableBody || !confirm) return;

  btn.addEventListener('click', () => {
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) handleReceiptUpload(file);
    input.value = '';
  });

  confirm.addEventListener('click', () => {
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    rows.forEach(tr => {
      const nameInput = tr.querySelector('td:first-child input');
      const qtyInput = tr.querySelector('td:nth-child(2) input');
      const name = nameInput.dataset.key || nameInput.value.trim();
      const qty = parseInt(qtyInput.value) || 1;
      if (name) addToShoppingList(name, qty);
    });
    renderSuggestions();
    renderShoppingList();
    modal.close();
    tableBody.innerHTML = '';
    input.value = '';
  });
}

async function handleReceiptUpload(file) {
  const modal = document.getElementById('receipt-modal');
  const tableBody = document.querySelector('#receipt-table tbody');
  if (!modal || !tableBody || !file) return;
  if (!modal.open) modal.showModal();
  const { data: { text } } = await Tesseract.recognize(file, currentLang === 'pl' ? 'pol' : 'eng');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const res = await fetch('/api/ocr-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: lines })
  });
  const data = await res.json();
  tableBody.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    const firstMatch = item.matches[0];
    nameInput.value = firstMatch ? firstMatch.name : item.original;
    if (firstMatch) nameInput.dataset.key = firstMatch.name;
    nameInput.className = 'input input-bordered w-full';
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = '1';
    qtyInput.className = 'input input-bordered w-20';
    qtyTd.appendChild(qtyInput);
    tr.appendChild(qtyTd);

    const statusTd = document.createElement('td');
    if (item.matches.length > 1) {
      const select = document.createElement('select');
      select.className = 'select select-bordered w-full';
      item.matches.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = productName(m.name);
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        nameInput.value = select.value;
        nameInput.dataset.key = select.value;
      });
      statusTd.appendChild(select);
    } else {
      const span = document.createElement('span');
      span.className = 'badge ' + (item.matches.length ? 'badge-success' : 'badge-warning');
      span.textContent = item.matches.length ? 'OK' : t('ocr_not_recognized');
      statusTd.appendChild(span);
    }
    tr.appendChild(statusTd);

    const removeTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-error';
    removeBtn.innerHTML = '<i class="fa-regular fa-circle-minus"></i>';
    removeBtn.addEventListener('click', () => tr.remove());
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);

    tableBody.appendChild(tr);
  });
}

// Hide labels on scroll down, show them on scroll up
const mobileNav = document.querySelector('.mobile-nav');
let lastScroll = 0;
window.addEventListener(
  'scroll',
  () => {
    if (!mobileNav || html.getAttribute('data-layout') !== 'mobile') return;
    const current = window.pageYOffset || document.documentElement.scrollTop;
    if (current > lastScroll) {
      mobileNav.classList.add('labels-hidden');
    } else if (current < lastScroll) {
      mobileNav.classList.remove('labels-hidden');
    }
    lastScroll = current <= 0 ? 0 : current;
  },
  { passive: true }
);

