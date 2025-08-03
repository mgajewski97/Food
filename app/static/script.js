let editing = false;
let groupedView = false;

const UNIT = 'szt.';
const LOW_STOCK_THRESHOLD = 1; // TODO: thresholds per category

// Translations for full category names
const CATEGORY_NAMES = {
  uncategorized: 'brak kategorii',
  fresh_veg: 'Świeże warzywa',
  mushrooms: 'Grzyby',
  dairy_eggs: 'Nabiał i jajka',
  opened_preserves: 'Otwarte konserwy i przetwory',
  ready_sauces: 'Gotowe sosy',
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

document.addEventListener('DOMContentLoaded', () => {
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
      unit: UNIT
    };
    if (editing) {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
    } else {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
    }
    editing = false;
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
  document.getElementById('edit-any').addEventListener('click', async () => {
    const name = prompt('Nazwa produktu:');
    if (!name) return;
    const product = (window.currentProducts || []).find(p => p.name === name);
    if (!product) {
      alert('Nie znaleziono produktu');
      return;
    }
    const qtyStr = prompt('Nowa ilość:', product.quantity);
    if (qtyStr === null) return;
    const quantity = parseFloat(qtyStr);
    if (isNaN(quantity)) {
      alert('Nieprawidłowa ilość');
      return;
    }
    const updated = { ...product, quantity };
    await fetch(`/api/products/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    await loadProducts();
    await loadRecipes();
  });
  document.getElementById('view-toggle').addEventListener('click', () => {
    groupedView = !groupedView;
    document.getElementById('product-table').style.display = groupedView ? 'none' : 'table';
    document.getElementById('product-list').style.display = groupedView ? 'block' : 'none';
    document.getElementById('view-toggle').textContent = groupedView ? 'Płaska lista' : 'Widok z podziałem';
  });
  document.getElementById('product-search').addEventListener('input', () => {
    renderProducts(getFilteredProducts());
  });
});

async function loadProducts() {
  const res = await fetch('/api/products');
  window.currentProducts = await res.json();
  renderProducts(getFilteredProducts());
}

function getFilteredProducts() {
  const query = document.getElementById('product-search').value.toLowerCase();
  return (window.currentProducts || []).filter(p =>
    p.name.toLowerCase().includes(query)
  );
}

function renderProducts(data) {
  const tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = '';
  data.forEach(p => {
    const tr = document.createElement('tr');
    if (p.quantity <= LOW_STOCK_THRESHOLD) {
      tr.classList.add('low-stock');
    }
    const nameTd = document.createElement('td');
    nameTd.textContent = p.name;
    tr.appendChild(nameTd);
    const qtyTd = document.createElement('td');
    qtyTd.textContent = p.quantity;
    tr.appendChild(qtyTd);
    const unitTd = document.createElement('td');
    unitTd.textContent = p.unit;
    tr.appendChild(unitTd);
    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Usuń';
    btn.addEventListener('click', async () => {
      await fetch(`/api/products/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
      await loadProducts();
      await loadRecipes();
    });
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);
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

  const order = ['fridge', 'pantry', 'freezer'];
  const titles = {
    fridge: `🧊 ${STORAGE_NAMES.fridge}`,
    pantry: `🏠 ${STORAGE_NAMES.pantry}`,
    freezer: `❄️ ${STORAGE_NAMES.freezer}`
  };

  order.forEach(stor => {
    if (!storages[stor]) return;
    const h3 = document.createElement('h3');
    h3.textContent = titles[stor] || stor;
    container.appendChild(h3);
    const categories = storages[stor];
    Object.keys(categories)
      .sort((a, b) => (CATEGORY_NAMES[a] || a).localeCompare(CATEGORY_NAMES[b] || b))
      .forEach(cat => {
        const h4 = document.createElement('h4');
        h4.textContent = CATEGORY_NAMES[cat] || cat;
        container.appendChild(h4);
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Nazwa', 'Ilość', 'Jednostka', ''].forEach(text => {
          const th = document.createElement('th');
          th.textContent = text;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbodyCat = document.createElement('tbody');
        categories[cat].sort((a, b) => a.name.localeCompare(b.name));
        categories[cat].forEach(p => {
          const tr = document.createElement('tr');
          if (p.quantity <= LOW_STOCK_THRESHOLD) {
            tr.classList.add('low-stock');
          }
          const nameTd = document.createElement('td');
          nameTd.textContent = p.name;
          tr.appendChild(nameTd);
          const qtyTd = document.createElement('td');
          qtyTd.textContent = p.quantity;
          tr.appendChild(qtyTd);
          const unitTd = document.createElement('td');
          unitTd.textContent = p.unit;
          tr.appendChild(unitTd);
          const actionTd = document.createElement('td');
          const edit = document.createElement('button');
          edit.textContent = 'Edytuj';
          edit.addEventListener('click', () => {
            const form = document.getElementById('add-form');
            form.name.value = p.name;
            form.quantity.value = p.quantity;
            form.category.value = p.category;
            form.storage.value = p.storage || 'pantry';
            editing = true;
          });
          const del = document.createElement('button');
          del.textContent = 'Usuń';
          del.addEventListener('click', async () => {
            await fetch(`/api/products/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
            await loadProducts();
            await loadRecipes();
          });
          actionTd.appendChild(del);
          tr.appendChild(actionTd);
          tbodyCat.appendChild(tr);
        });
        table.appendChild(tbodyCat);
        container.appendChild(table);
      });
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
