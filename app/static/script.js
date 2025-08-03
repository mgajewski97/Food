const UNIT = 'szt.';
const LOW_STOCK_THRESHOLD = 1; // TODO: thresholds per category

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadRecipes();

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const product = {
      name: form.name.value,
      quantity: parseFloat(form.quantity.value),
      category: form.category.value,
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
});

async function loadProducts() {
  const res = await fetch('/api/products');
  const data = await res.json();
  window.currentProducts = data;
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
}

async function loadRecipes() {
  const res = await fetch('/api/recipes');
  const data = await res.json();
  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  data.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.name} (${r.ingredients.join(', ')})`;
    list.appendChild(li);
  });
}
