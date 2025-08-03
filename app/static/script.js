let groupedView = false;
let editMode = false;
let currentFilter = 'available';
let pendingDelete = [];
let currentLang = localStorage.getItem('lang') || 'pl';
let UNIT = '';
const LOW_STOCK_CLASS = 'text-error bg-error/10';

let shoppingList = JSON.parse(localStorage.getItem('shoppingList') || '[]');
let pendingRemoveIndex = null;

let uiTranslations = { pl: {}, en: {} };
let translations = { products: {}, units: {} };

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
    translations.units = {};
    Object.entries(pl).forEach(([k, v]) => {
      if (k.startsWith('product.')) {
        const key = k.slice('product.'.length);
        translations.products[key] = { pl: v, en: en[k] || '(no translation)' };
      } else if (k.startsWith('unit.')) {
        const key = k.slice('unit.'.length);
        translations.units[key] = { pl: v, en: en[k] || '(no translation)' };
      }
    });
  } catch (err) {
    console.error('Failed to load translations', err);
    uiTranslations = { pl: {}, en: {} };
    translations = { products: {}, units: {} };
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
  if (!key || !key.startsWith('unit.')) return key;
  const k = key.slice('unit.'.length);
  const entry = translations.units[k];
  return entry ? entry[currentLang] || '(no translation)' : '(no translation)';
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

  document.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();
    document.documentElement.setAttribute('lang', currentLang);
    UNIT = t('unit_piece');
    applyTranslations();
  const html = document.documentElement;
  const icon = document.getElementById('layout-icon');
  if (window.innerWidth < 768) {
    html.setAttribute('data-layout', 'mobile');
    if (icon) icon.className = 'fa-solid fa-desktop';
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
        UNIT = t('unit_piece');
        applyTranslations();
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
      });
    }

  loadProducts();

  document.querySelectorAll('[data-tab-target]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-tab-target]').forEach(t => t.classList.remove('tab-active', 'font-bold'));
      tab.classList.add('tab-active', 'font-bold');
      document.querySelectorAll('.tab-panel').forEach(panel => (panel.style.display = 'none'));
      const targetId = tab.dataset.tabTarget;
      const panel = document.getElementById(targetId);
      if (panel) panel.style.display = 'block';
      if (targetId === 'tab-products') {
        loadProducts();
      } else if (targetId === 'tab-recipes') {
        loadRecipes();
      } else if (targetId === 'tab-history') {
        loadHistory();
      } else if (targetId === 'tab-shopping') {
        renderSuggestions();
        renderShoppingList();
      }
    });
  });

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

  document.getElementById('history-form').addEventListener('submit', handleHistorySubmit);
  document.getElementById('history-cancel').addEventListener('click', () => {
    const form = document.getElementById('history-form');
    form.style.display = 'none';
  });
  document.getElementById('add-ingredient').addEventListener('click', () => addIngredientRow());
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
        const unitChanged = newUnit !== unitName(original.unit);
        const qtyChanged = newQty !== original.quantity;
        const catChanged = newCat !== original.category;
        const storChanged = newStor !== original.storage;
        if (nameChanged) {
          const key = original.name.slice('product.'.length);
          if (!translations.products[key]) translations.products[key] = {};
          translations.products[key][currentLang] = newName;
        }
        if (unitChanged) {
          const key = original.unit.slice('unit.'.length);
          if (!translations.units[key]) translations.units[key] = {};
          translations.units[key][currentLang] = newUnit;
        }
        if (qtyChanged || catChanged || storChanged) {
          updates.push({
            originalName: original.name,
            updated: { ...original, name: original.name, quantity: newQty, unit: original.unit, category: newCat, storage: newStor }
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
      alert(t('invalid_json_alert'));
    }
  });

  const manualQty = document.getElementById('manual-qty');
  const manualDec = document.getElementById('manual-dec');
  const manualInc = document.getElementById('manual-inc');
  if (manualDec && manualInc && manualQty) {
    manualDec.addEventListener('click', () => {
      manualQty.value = Math.max(1, (parseInt(manualQty.value) || 1) - 1);
    });
    manualInc.addEventListener('click', () => {
      manualQty.value = (parseInt(manualQty.value) || 1) + 1;
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
    tr.className = 'bg-white border-b hover:bg-gray-50';
    if (p.low_stock) {
      tr.className += ` ${LOW_STOCK_CLASS}`;
    }
    if (editMode) {
      const selectTd = document.createElement('td');
      selectTd.className = 'px-4 py-2';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'row-select checkbox';
      cb.addEventListener('change', updateDeleteButton);
      selectTd.appendChild(cb);
      tr.appendChild(selectTd);

      const nameTd = document.createElement('td');
      nameTd.className = 'px-4 py-2';
      const nameInput = document.createElement('input');
      nameInput.value = productName(p.name);
      nameInput.dataset.key = p.name;
      nameInput.className = 'edit-name input input-bordered w-full';
      nameTd.appendChild(nameInput);
      tr.appendChild(nameTd);

      const qtyTd = document.createElement('td');
      qtyTd.className = 'px-4 py-2 flex items-center';
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
      unitTd.className = 'px-4 py-2';
      const unitInput = document.createElement('input');
      unitInput.value = unitName(p.unit);
      unitInput.dataset.key = p.unit;
      unitInput.className = 'edit-unit input input-bordered w-full';
      unitTd.appendChild(unitInput);
      tr.appendChild(unitTd);

      const catTd = document.createElement('td');
      catTd.className = 'px-4 py-2';
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
      storTd.className = 'px-4 py-2';
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
      statusTd.className = 'px-4 py-2 text-center';
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
    } else {
      const nameTd = document.createElement('td');
      nameTd.className = 'px-4 py-2';
      nameTd.textContent = productName(p.name);
      tr.appendChild(nameTd);

      const qtyTd = document.createElement('td');
      qtyTd.className = 'px-4 py-2';
      qtyTd.textContent = formatPackQuantity(p);
      if (p.pack_size) {
        qtyTd.title = t('pack_title');
      }
      tr.appendChild(qtyTd);

      const unitTd = document.createElement('td');
      unitTd.className = 'px-4 py-2';
      unitTd.textContent = unitName(p.unit);
      tr.appendChild(unitTd);

      const catTd = document.createElement('td');
      catTd.className = 'px-4 py-2';
      catTd.textContent = categoryName(p.category);
      tr.appendChild(catTd);

      const storTd = document.createElement('td');
      storTd.className = 'px-4 py-2';
      storTd.textContent = storageName(p.storage);
      tr.appendChild(storTd);

      const statusTd = document.createElement('td');
      statusTd.className = 'px-4 py-2 text-center';
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
    storageBlock.className = 'storage-block border border-base-300 rounded-lg p-4 mb-6';
    storageBlock.id = `storage-${storIndex}`;

    const storageHeader = document.createElement('div');
    storageHeader.className =
      'flex justify-between items-center mb-4 rounded px-2 cursor-pointer md:cursor-default hover:bg-neutral/20 md:hover:bg-transparent';
    storageHeader.id = `storage-header-${storIndex}`;

    const h3 = document.createElement('h3');
    h3.className = 'text-2xl font-bold';
    h3.textContent = `${STORAGE_ICONS[stor] || ''} ${storageName(stor)}`;

    const storToggle = document.createElement('button');
    storToggle.className = 'text-xl cursor-pointer bg-transparent border-0 p-0';
    storToggle.innerHTML = '<i class="fa-regular fa-caret-down"></i>';
    storToggle.id = `storage-toggle-${storIndex}`;

    storageHeader.appendChild(h3);
    storageHeader.appendChild(storToggle);
    storageBlock.appendChild(storageHeader);

    const storageContent = document.createElement('div');
    storageContent.className = 'space-y-4';
    storageBlock.appendChild(storageContent);

    let storOpen = true;
    const toggleStorage = () => {
      storOpen = !storOpen;
      storageContent.classList.toggle('hidden', !storOpen);
      storToggle.innerHTML = `<i class="fa-regular fa-caret-${storOpen ? 'down' : 'up'}"></i>`;
    };
    storageHeader.addEventListener('click', e => {
      const isMobile = document.documentElement.getAttribute('data-layout') === 'mobile';
      if (isMobile || e.target.closest('button') === storToggle) {
        toggleStorage();
      }
    });

    const categories = storages[stor];
    Object.keys(categories)
      .sort((a, b) => categoryName(a).localeCompare(categoryName(b)))
      .forEach((cat, catIndex) => {
          const categoryBlock = document.createElement('div');
          categoryBlock.className = 'category-block';
          categoryBlock.id = `category-${storIndex}-${catIndex}`;

        const catHeader = document.createElement('div');
        catHeader.className =
          'flex justify-between items-center mb-2 rounded px-2 cursor-pointer md:cursor-default hover:bg-neutral/20 md:hover:bg-transparent';
        catHeader.id = `category-header-${storIndex}-${catIndex}`;

        const h4 = document.createElement('h4');
        h4.className = 'text-md font-semibold';
        h4.textContent = categoryName(cat);

        const catToggle = document.createElement('button');
        catToggle.className = 'text-md cursor-pointer bg-transparent border-0 p-0';
        catToggle.innerHTML = '<i class="fa-regular fa-caret-down"></i>';
        catToggle.id = `category-toggle-${storIndex}-${catIndex}`;

        catHeader.appendChild(h4);
        catHeader.appendChild(catToggle);
        categoryBlock.appendChild(catHeader);

          const table = document.createElement('table');
          table.className = 'table table-zebra w-full';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        [t('table_header_name'), t('table_header_quantity'), t('table_header_unit'), t('table_header_status'), t('grouped_table_delete_header')].forEach(text => {
          const th = document.createElement('th');
          th.className = 'px-4 py-2';
          th.textContent = text;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbodyCat = document.createElement('tbody');
        categories[cat].sort((a, b) => productName(a.name).localeCompare(productName(b.name)));
        categories[cat].forEach(p => {
          const tr = document.createElement('tr');
          tr.className = 'hover';
          if (p.low_stock) {
            tr.classList.add(...LOW_STOCK_CLASS.split(' '));
          }
          const nameTd = document.createElement('td');
          nameTd.className = 'px-4 py-2';
          nameTd.textContent = productName(p.name);
          tr.appendChild(nameTd);

          const qtyTd = document.createElement('td');
          qtyTd.className = 'px-4 py-2';
          qtyTd.textContent = formatPackQuantity(p);
        if (p.pack_size) {
          qtyTd.title = t('pack_title');
        }
          tr.appendChild(qtyTd);

          const unitTd = document.createElement('td');
          unitTd.className = 'px-4 py-2';
          unitTd.textContent = unitName(p.unit);
          tr.appendChild(unitTd);

          const statusTd = document.createElement('td');
          statusTd.className = 'px-4 py-2 text-center';
          const status = getStatusIcon(p);
          if (status) {
            statusTd.innerHTML = status.html;
            statusTd.title = status.title;
          }
          tr.appendChild(statusTd);

          tbodyCat.appendChild(tr);
        });
        table.appendChild(tbodyCat);
        categoryBlock.appendChild(table);
        storageContent.appendChild(categoryBlock);

        let catOpen = true;
        const toggleCategory = () => {
          catOpen = !catOpen;
          table.classList.toggle('hidden', !catOpen);
          catToggle.innerHTML = `<i class="fa-regular fa-caret-${catOpen ? 'down' : 'up'}"></i>`;
        };
        catHeader.addEventListener('click', e => {
          const isMobile = document.documentElement.getAttribute('data-layout') === 'mobile';
          if (isMobile || e.target.closest('button') === catToggle) {
            toggleCategory();
          }
        });
      });
    container.appendChild(storageBlock);
  });
}

function updateDeleteButton() {
  const btn = document.getElementById('delete-selected');
  if (!btn) return;
  const any = document.querySelectorAll('.row-select:checked').length > 0;
  btn.disabled = !any;
}

async function loadRecipes() {
  const res = await fetch('/api/recipes');
  const data = await res.json();
  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  data.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.name} (${r.ingredients.join(', ')})`;
    const doneBtn = document.createElement('button');
    doneBtn.textContent = t('recipe_done_button');
    doneBtn.addEventListener('click', () => showHistoryForm(r, false));
    const modBtn = document.createElement('button');
    modBtn.textContent = t('recipe_done_mod_button');
    modBtn.addEventListener('click', () => showHistoryForm(r, true));
    li.appendChild(doneBtn);
    li.appendChild(modBtn);
    list.appendChild(li);
  });
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const data = await res.json();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  data.forEach(h => {
    const li = document.createElement('li');
    const star = h.favorite ? ' ★' : '';
    li.textContent = `${h.date} - ${h.name} (${t('label_taste')} ${h.rating.taste}, ${t('label_effort')} ${h.rating.effort})${star}`;
    list.appendChild(li);
  });
}

function addIngredientRow(name = '', qty = '') {
  const container = document.getElementById('used-ingredients');
  const div = document.createElement('div');
  div.className = 'ingredient';
  const nameInput = document.createElement('input');
  nameInput.className = 'ing-name';
  nameInput.placeholder = t('ingredient_placeholder');
  nameInput.value = name;
  const qtyInput = document.createElement('input');
  qtyInput.className = 'ing-qty';
  qtyInput.placeholder = t('quantity_placeholder_ing');
  qtyInput.value = qty;
  div.appendChild(nameInput);
  div.appendChild(qtyInput);
  container.appendChild(div);
}

function showHistoryForm(recipe, allowExtra) {
  const form = document.getElementById('history-form');
  document.getElementById('history-title').textContent = recipe.name;
  document.getElementById('history-name').value = recipe.name;
  const container = document.getElementById('used-ingredients');
  container.innerHTML = '';
  recipe.ingredients.forEach(ing => {
    const div = document.createElement('div');
    div.className = 'ingredient';
    div.dataset.name = ing;
    const label = document.createElement('span');
    label.textContent = ing;
    const qtyInput = document.createElement('input');
    qtyInput.className = 'ing-qty';
    qtyInput.placeholder = t('quantity_placeholder_ing');
    div.appendChild(label);
    div.appendChild(qtyInput);
    container.appendChild(div);
  });
  document.getElementById('add-ingredient').style.display = allowExtra ? 'inline' : 'none';
  form.style.display = 'block';
}

async function handleHistorySubmit(e) {
  e.preventDefault();
  const form = e.target;
  const used = {};
  document.querySelectorAll('#used-ingredients .ingredient').forEach(row => {
    const name = row.dataset.name || row.querySelector('.ing-name').value.trim();
    const qty = row.querySelector('.ing-qty').value.trim();
    if (name) {
      used[name] = qty;
    }
  });
  const entry = {
    name: document.getElementById('history-name').value,
    used_ingredients: used,
    rating: {
      taste: parseInt(form.taste.value) || 0,
      effort: parseInt(form.effort.value) || 0
    },
    favorite: form.favorite.checked
  };
  await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
  form.reset();
  form.style.display = 'none';
  await loadProducts();
  await loadRecipes();
  await loadHistory();
}

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
if (themeToggle && themeIcon) {
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    themeIcon.className = 'fa-solid fa-circle-half-stroke';
  });
}

// Layout toggle
const layoutToggle = document.getElementById('layout-toggle');
const layoutIcon = document.getElementById('layout-icon');
if (layoutToggle && layoutIcon) {
  layoutToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-layout') || 'desktop';
    const next = current === 'desktop' ? 'mobile' : 'desktop';
    html.setAttribute('data-layout', next);
    layoutIcon.className = next === 'desktop' ? 'fa-regular fa-mobile' : 'fa-solid fa-desktop';
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
  const qtyInput = document.getElementById('manual-qty');
  let name = nameInput.value.trim();
  const qty = parseInt(qtyInput.value) || 1;
  if (!name) return;
  const opt = Array.from(document.querySelectorAll('#product-datalist option')).find(o => o.value.toLowerCase() === name.toLowerCase());
  if (opt) name = opt.dataset.key;
  addToShoppingList(name, qty);
  nameInput.value = '';
  qtyInput.value = '1';
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
    qtyInput.className = 'input input-bordered w-16 text-center mx-2 no-spinner';
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
    acceptBtn.className = 'text-success';
    acceptBtn.innerHTML = '<i class="fa-regular fa-circle-check"></i>';
    acceptBtn.setAttribute('aria-label', t('accept'));
    acceptBtn.addEventListener('click', () => {
      addToShoppingList(p.name, parseInt(qtyInput.value) || 1);
      renderSuggestions();
    });
    acceptTd.appendChild(acceptBtn);
    tr.appendChild(acceptTd);

    const rejectTd = document.createElement('td');
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'text-error';
    rejectBtn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i>';
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
    if (item.inCart) tr.classList.add('opacity-50', 'italic');

    const nameTd = document.createElement('td');
    nameTd.textContent = productName(item.name);
    if (item.inCart) nameTd.classList.add('line-through');
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'flex items-center justify-center';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.textContent = '−';
    dec.className = 'btn btn-outline btn-xs';
    dec.disabled = item.inCart;
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = item.quantity;
    qtyInput.className = 'input input-bordered w-16 text-center mx-2 no-spinner';
    qtyInput.disabled = item.inCart;
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.textContent = '+';
    inc.className = 'btn btn-outline btn-xs';
    inc.disabled = item.inCart;
    dec.addEventListener('click', () => {
      const v = parseInt(qtyInput.value) || 1;
      const newVal = Math.max(1, v - 1);
      qtyInput.value = newVal;
      item.quantity = newVal;
      saveShoppingList();
    });
    inc.addEventListener('click', () => {
      const v = parseInt(qtyInput.value) || 1;
      const newVal = v + 1;
      qtyInput.value = newVal;
      item.quantity = newVal;
      saveShoppingList();
    });
    qtyInput.addEventListener('change', () => {
      const v = Math.max(1, parseInt(qtyInput.value) || 1);
      qtyInput.value = v;
      item.quantity = v;
      saveShoppingList();
    });
    qtyWrap.append(dec, qtyInput, inc);
    qtyTd.appendChild(qtyWrap);
    tr.appendChild(qtyTd);

    const ownedTd = document.createElement('td');
    const product = (window.currentProducts || []).find(p => p.name === item.name && p.quantity > 0);
    ownedTd.textContent = product ? `${formatQuantity(product)} ${t('owned')}` : '';
    tr.appendChild(ownedTd);

    const cartTd = document.createElement('td');
    const cartBtn = document.createElement('button');
    cartBtn.type = 'button';
    cartBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
    cartBtn.className = item.inCart ? 'text-success' : 'text-gray-400';
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
    cartTd.appendChild(cartBtn);
    tr.appendChild(cartTd);

    const removeTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-error';
    removeBtn.innerHTML = '<i class="fa-regular fa-circle-minus"></i>';
    removeBtn.setAttribute('aria-label', t('remove'));
    removeBtn.addEventListener('click', () => {
      pendingRemoveIndex = idx;
      const modal = document.getElementById('shopping-delete-modal');
      if (modal) modal.showModal();
    });
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);

    tbody.appendChild(tr);
  });
}

