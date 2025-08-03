document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadRecipes();

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const product = {
      name: form.name.value,
      quantity: form.quantity.value,
      category: form.category.value
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
      lines.push(`- ${p.name}: ${p.quantity}`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
  });
});

async function loadProducts() {
  const res = await fetch('/api/products');
  const data = await res.json();
  window.currentProducts = data;
  const list = document.getElementById('product-list');
  list.innerHTML = '';
  data.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name} - ${p.quantity} (${p.category}) `;
    const btn = document.createElement('button');
    btn.textContent = 'Usuń';
    btn.addEventListener('click', async () => {
      await fetch(`/api/products/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
      await loadProducts();
      await loadRecipes();
    });
    li.appendChild(btn);
    list.appendChild(li);
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
