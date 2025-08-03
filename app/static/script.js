let groupedView = false;
let editMode = false;
let currentFilter = 'missing_low';

const UNIT = 'szt.';
const LOW_STOCK_CLASS = 'text-error bg-error/10';

// Translations for full category names
const CATEGORY_NAMES = {
  uncategorized: 'brak kategorii',
  fresh_veg: 'Świeże warzywa',
  mushrooms: 'Grzyby',
  dairy_eggs: 'Nabiał i jajka',
  opened_preserves: 'Otwarte konserwy i przetwory',
  ready_sauces: 'Sosy',
  dry_veg: 'Warzywa suche',
  bread: 'Pieczywo',
  pasta: 'Makarony',
  rice: 'Ryże',
  grains: 'Kasze',
  dried_legumes: 'Suche rośliny strączkowe',
  sauces: 'Sosy i przyprawy płynne',
  oils: 'Oleje',
  spreads: 'Smarowidła i pasty',
  frozen_veg: 'Mrożone warzywa',
  frozen_sauces: 'Mrożone sosy',
  frozen_meals: 'Mrożone dania / zupy'
};

const STORAGE_NAMES = {
  fridge: 'Lodówka',
  pantry: 'Szafka',
  freezer: 'Zamrażarka'
};

const STORAGE_ICONS = {
  fridge: '🧊',
  pantry: '🏠',
  freezer: '❄️'
};

function getStatusIcon(p) {
  if (p.main) {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: 'Brak produktu' };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-500"></i>', title: 'Produkt się kończy' };
    }
  } else {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: 'Brak produktu' };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-300"></i>', title: 'Produkt się kończy' };
    }
  }
  return null;
}

function updateFilterVisibility() {
  const layout = document.documentElement.getAttribute('data-layout');
  const radios = document.getElementById('filter-radios');
  const selectWrapper = document.getElementById('filter-select-wrapper');
  if (layout === 'mobile') {
    if (radios) radios.style.display = 'none';
    if (selectWrapper) selectWrapper.style.display = 'block';
  } else {
    if (radios) radios.style.display = 'flex';
    if (selectWrapper) selectWrapper.style.display = 'none';
  }
}

function sortProducts(list) {
  return list.sort((a, b) => {
    const storA = STORAGE_NAMES[a.storage] || a.storage;
    const storB = STORAGE_NAMES[b.storage] || b.storage;
    const storCmp = storA.localeCompare(storB);
    if (storCmp !== 0) return storCmp;
    const catA = CATEGORY_NAMES[a.category] || a.category;
    const catB = CATEGORY_NAMES[b.category] || b.category;
    const catCmp = catA.localeCompare(catB);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const icon = document.getElementById('layout-icon');
  if (window.innerWidth < 768) {
    html.setAttribute('data-layout', 'mobile');
    if (icon) icon.className = 'fa-solid fa-desktop';
  }
  updateFilterVisibility();

  loadProducts();
  loadRecipes();
  loadHistory();

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const product = {
      name: form.name.value,
      quantity: parseFloat(form.quantity.value),
      category: form.category.value,
      storage: form.storage.value,
      threshold: form.threshold.value ? parseFloat(form.threshold.value) : null,
      main: form.main.checked,
      unit: UNIT
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
    const lines = ['Produkty:'];
    (window.currentProducts || []).forEach(p => {
      lines.push(`- ${p.name}: ${p.quantity} ${p.unit}`);
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
    groupedView = !groupedView;
    document.getElementById('product-table').style.display = groupedView ? 'none' : 'table';
    document.getElementById('product-list').style.display = groupedView ? 'block' : 'none';
    document.getElementById('view-toggle').textContent = groupedView ? 'Płaska lista' : 'Widok z podziałem';
  });
  document.getElementById('edit-toggle').addEventListener('click', async () => {
    editMode = !editMode;
    document.getElementById('edit-toggle').textContent = editMode ? 'Zakończ edycję' : 'Edytuj';
    document.getElementById('save-btn').style.display = editMode ? 'inline-block' : 'none';
    if (!editMode) {
      await loadProducts();
    } else {
      renderProducts(getFilteredProducts());
    }
  });
  document.getElementById('save-btn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('#product-table tbody tr');
    const data = getFilteredProducts();
    const updates = [];
    rows.forEach((tr, idx) => {
      const nameInput = tr.querySelector('td:nth-child(1) input');
      const qtyInput = tr.querySelector('td:nth-child(2) input');
      if (nameInput && qtyInput) {
        const original = data[idx];
        const newName = nameInput.value.trim();
        const newQty = parseFloat(qtyInput.value);
        if (newName !== original.name || newQty !== original.quantity) {
          updates.push({ originalName: original.name, updated: { ...original, name: newName, quantity: newQty } });
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
    document.getElementById('edit-toggle').textContent = 'Edytuj';
    document.getElementById('save-btn').style.display = 'none';
    await loadProducts();
    if (updates.length) {
      await loadRecipes();
    }
  });
  document.getElementById('product-search').addEventListener('input', () => {
    renderProducts(getFilteredProducts());
  });
  document.querySelectorAll('#filter-radios input[name="product-filter"]').forEach(r => {
    r.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      const select = document.getElementById('filter-select');
      if (select) select.value = currentFilter;
      renderProducts(getFilteredProducts());
    });
  });
  document.getElementById('filter-select').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    const radio = document.querySelector(`#filter-radios input[value="${currentFilter}"]`);
    if (radio) radio.checked = true;
    renderProducts(getFilteredProducts());
  });
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
      alert('Nieprawidłowy JSON');
    }
  });
  });

async function loadProducts() {
  const res = await fetch('/api/products');
  const data = await res.json();
  window.currentProducts = sortProducts(data.map(p => {
    p.low_stock = p.threshold !== null && p.quantity <= p.threshold;
    return p;
  }));
  renderProducts(getFilteredProducts());
}

function getFilteredProducts() {
  const query = document.getElementById('product-search').value.toLowerCase();
  return sortProducts((window.currentProducts || []).filter(p => {
    switch (currentFilter) {
      case 'missing':
        if (!(p.main && p.quantity === 0)) return false;
        break;
      case 'missing_low':
        if (!(p.main && (p.quantity === 0 || (p.threshold !== null && p.quantity <= p.threshold)))) return false;
        break;
      case 'all_zero':
        if (p.quantity !== 0) return false;
        break;
      case 'all':
        break;
    }
    if (currentFilter !== 'all' && currentFilter !== 'all_zero') {
      if (!p.main && p.quantity === 0) return false;
    }
    return p.name.toLowerCase().includes(query);
  }));
}

  function addRowActions(tr, product) {
    const actionTd = document.createElement('td');
    actionTd.className = 'px-4 py-2';
    const del = document.createElement('button');
    del.textContent = 'Usuń';
    del.className = 'px-2 py-1 text-white bg-red-600 rounded hover:bg-red-700';
    del.addEventListener('click', async () => {
      await fetch(`/api/products/${encodeURIComponent(product.name)}`, { method: 'DELETE' });
      await loadProducts();
      await loadRecipes();
    });
    actionTd.appendChild(del);
    tr.appendChild(actionTd);
  }

function renderProducts(data) {
  const tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = '';
    data.forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'bg-white border-b hover:bg-gray-50';
      if (p.low_stock) {
        tr.className += ` ${LOW_STOCK_CLASS}`;
      }
      const nameTd = document.createElement('td');
      nameTd.className = 'px-4 py-2';
      const qtyTd = document.createElement('td');
      qtyTd.className = 'px-4 py-2';
      if (editMode) {
        const nameInput = document.createElement('input');
        nameInput.value = p.name;
        nameTd.appendChild(nameInput);
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = p.quantity;
        qtyTd.appendChild(qtyInput);
      } else {
        nameTd.textContent = p.name;
        qtyTd.textContent = p.quantity;
      }
      tr.appendChild(nameTd);
      tr.appendChild(qtyTd);
      const unitTd = document.createElement('td');
      unitTd.className = 'px-4 py-2';
      unitTd.textContent = p.unit;
      tr.appendChild(unitTd);
      const catTd = document.createElement('td');
      catTd.className = 'px-4 py-2';
      catTd.textContent = CATEGORY_NAMES[p.category] || p.category;
      tr.appendChild(catTd);
      const storTd = document.createElement('td');
      storTd.className = 'px-4 py-2';
      storTd.textContent = STORAGE_NAMES[p.storage] || p.storage;
      tr.appendChild(storTd);
      const statusTd = document.createElement('td');
      statusTd.className = 'px-4 py-2 text-center';
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
      addRowActions(tr, p);
      tbody.appendChild(tr);
    });

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
    (STORAGE_NAMES[a] || a).localeCompare(STORAGE_NAMES[b] || b)
  );
  storOrder.forEach(stor => {
    const storageBlock = document.createElement('div');
    storageBlock.className = 'storage-block border border-base-300 rounded-lg p-4 mb-6';

    const storageHeader = document.createElement('div');
    storageHeader.className = 'flex justify-between items-center mb-4 cursor-pointer md:cursor-default pl-4';

    const h3 = document.createElement('h3');
    h3.className = 'text-xl font-semibold';
    h3.textContent = `${STORAGE_ICONS[stor] || ''} ${STORAGE_NAMES[stor] || stor}`;

    const storToggle = document.createElement('button');
    storToggle.className = 'text-xl cursor-pointer';
    storToggle.innerHTML = '<i class="fa-regular fa-caret-down"></i>';

    storageHeader.appendChild(h3);
    storageHeader.appendChild(storToggle);
    storageBlock.appendChild(storageHeader);

    const storageContent = document.createElement('div');
    storageContent.className = 'space-y-4';
    storageBlock.appendChild(storageContent);

    let storOpen = true;
    const toggleStorage = () => {
      storOpen = !storOpen;
      storageContent.style.display = storOpen ? 'block' : 'none';
      storToggle.innerHTML = `<i class="fa-regular fa-caret-${storOpen ? 'down' : 'up'}"></i>`;
    };
    if (window.innerWidth < 768) {
      storageHeader.addEventListener('click', toggleStorage);
    } else {
      storToggle.addEventListener('click', toggleStorage);
    }

    const categories = storages[stor];
    Object.keys(categories)
      .sort((a, b) => (CATEGORY_NAMES[a] || a).localeCompare(CATEGORY_NAMES[b] || b))
      .forEach(cat => {
        const categoryBlock = document.createElement('div');
        categoryBlock.className = 'category-block mb-4';

        const catHeader = document.createElement('div');
        catHeader.className = 'flex justify-between items-center mb-2 cursor-pointer md:cursor-default pl-4';

        const h4 = document.createElement('h4');
        h4.className = 'text-lg font-medium';
        h4.textContent = CATEGORY_NAMES[cat] || cat;

        const catToggle = document.createElement('button');
        catToggle.className = 'text-md cursor-pointer';
        catToggle.innerHTML = '<i class="fa-regular fa-caret-down"></i>';

        catHeader.appendChild(h4);
        catHeader.appendChild(catToggle);
        categoryBlock.appendChild(catHeader);

        const table = document.createElement('table');
        table.className = 'table table-zebra w-full mb-4';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Nazwa', 'Ilość', 'Jednostka', 'Status', 'Usuń'].forEach(text => {
          const th = document.createElement('th');
          th.className = 'px-4 py-2';
          th.textContent = text;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbodyCat = document.createElement('tbody');
        categories[cat].sort((a, b) => a.name.localeCompare(b.name));
        categories[cat].forEach(p => {
          const tr = document.createElement('tr');
          tr.className = 'hover';
          if (p.low_stock) {
            tr.classList.add(...LOW_STOCK_CLASS.split(' '));
          }
          const nameTd = document.createElement('td');
          nameTd.className = 'px-4 py-2';
          const qtyTd = document.createElement('td');
          qtyTd.className = 'px-4 py-2';
          if (editMode) {
            const nameInput = document.createElement('input');
            nameInput.value = p.name;
            nameTd.appendChild(nameInput);
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.value = p.quantity;
            qtyTd.appendChild(qtyInput);
          } else {
            nameTd.textContent = p.name;
            qtyTd.textContent = p.quantity;
          }
          tr.appendChild(nameTd);
          tr.appendChild(qtyTd);
          const unitTd = document.createElement('td');
          unitTd.className = 'px-4 py-2';
          unitTd.textContent = p.unit;
          tr.appendChild(unitTd);
          const statusTd = document.createElement('td');
          statusTd.className = 'px-4 py-2 text-center';
          const status = getStatusIcon(p);
          if (status) {
            statusTd.innerHTML = status.html;
            statusTd.title = status.title;
          }
          tr.appendChild(statusTd);
          addRowActions(tr, p);
          tbodyCat.appendChild(tr);
        });
        table.appendChild(tbodyCat);
        categoryBlock.appendChild(table);
        storageContent.appendChild(categoryBlock);

        let catOpen = true;
        const toggleCategory = () => {
          catOpen = !catOpen;
          table.style.display = catOpen ? 'table' : 'none';
          catToggle.innerHTML = `<i class="fa-regular fa-caret-${catOpen ? 'down' : 'up'}"></i>`;
        };
        if (window.innerWidth < 768) {
          catHeader.addEventListener('click', toggleCategory);
        } else {
          catToggle.addEventListener('click', toggleCategory);
        }
      });
    container.appendChild(storageBlock);
  });
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
    doneBtn.textContent = 'Zrobione';
    doneBtn.addEventListener('click', () => showHistoryForm(r, false));
    const modBtn = document.createElement('button');
    modBtn.textContent = 'Zrobione (ze zmianami)';
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
    li.textContent = `${h.date} - ${h.name} (smak: ${h.rating.taste}, wysiłek: ${h.rating.effort})${star}`;
    list.appendChild(li);
  });
}

function addIngredientRow(name = '', qty = '') {
  const container = document.getElementById('used-ingredients');
  const div = document.createElement('div');
  div.className = 'ingredient';
  const nameInput = document.createElement('input');
  nameInput.className = 'ing-name';
  nameInput.placeholder = 'składnik';
  nameInput.value = name;
  const qtyInput = document.createElement('input');
  qtyInput.className = 'ing-qty';
  qtyInput.placeholder = 'ilość';
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
    qtyInput.placeholder = 'ilość';
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
    updateFilterVisibility();
  });
}
