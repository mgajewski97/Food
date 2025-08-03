let editingName = null;

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadRecipes();

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const product = {
      name: form.name.value,
      quantity: form.quantity.value,
      category: form.category.value,
      storage: form.storage.value
    };
    if (editingName) {
      await fetch(`/api/products/${encodeURIComponent(editingName)}`, {
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
    editingName = null;
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
  const container = document.getElementById('product-list');
  container.innerHTML = '';

  const groups = {};
  data.forEach(p => {
    const storage = p.storage || 'pantry';
    if (!groups[storage]) groups[storage] = [];
    groups[storage].push(p);
  });

  const order = ['fridge', 'pantry', 'freezer'];
  const titles = {
    fridge: '🧊 Lodówka',
    pantry: '🏠 Spiżarnia',
    freezer: '❄️ Zamrażarka'
  };

  order.forEach(stor => {
    if (groups[stor] && groups[stor].length) {
      const h = document.createElement('h3');
      h.textContent = titles[stor] || stor;
      container.appendChild(h);
      const ul = document.createElement('ul');
      groups[stor].sort((a, b) => a.category.localeCompare(b.category));
      groups[stor].forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} - ${p.quantity} (${p.category}) `;
        const edit = document.createElement('button');
        edit.textContent = 'Edytuj';
        edit.addEventListener('click', () => {
          const form = document.getElementById('add-form');
          form.name.value = p.name;
          form.quantity.value = p.quantity;
          form.category.value = p.category;
          form.storage.value = p.storage || 'pantry';
          editingName = p.name;
        });
        const del = document.createElement('button');
        del.textContent = 'Usuń';
        del.addEventListener('click', async () => {
          await fetch(`/api/products/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
          await loadProducts();
          await loadRecipes();
        });
        li.appendChild(edit);
        li.appendChild(del);
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }
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
