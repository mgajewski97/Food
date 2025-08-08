import { t, state, productName, unitName, categoryName, storageName, formatPackQuantity, getStatusIcon, STORAGE_ICONS, CATEGORY_KEYS, STORAGE_KEYS } from '../helpers.js';
export function renderProducts(data, editable = false) {
  const table = document.getElementById('product-table');
  const tbody = table ? table.querySelector('tbody') : null;
  if (editable) {
    table && table.classList.add('edit-mode');
  } else {
    table && table.classList.remove('edit-mode');
  }
  if (tbody) tbody.innerHTML = '';
  data.forEach((p, idx) => {
    const tr = document.createElement('tr');
    if (editable) {
      // Checkbox cell
      const cbTd = document.createElement('td');
      cbTd.className = 'checkbox-cell';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'checkbox checkbox-sm product-select';
      cb.dataset.name = p.name;
      cbTd.appendChild(cb);
      tr.appendChild(cbTd);
      // Name cell
      const nameTd = document.createElement('td');
      nameTd.className = 'name-cell';
      nameTd.textContent = productName(p.name);
      tr.appendChild(nameTd);
      // Quantity cell with controls
      const qtyTd = document.createElement('td');
      qtyTd.className = 'qty-cell';
      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'quantity-control';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'btn btn-xs';
      minus.textContent = '−';
      const input = document.createElement('input');
      input.type = 'number';
      input.value = p.quantity;
      input.className = 'input input-bordered w-full text-center';
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'btn btn-xs';
      plus.textContent = '+';
      minus.addEventListener('click', () => {
        input.value = Math.max(0, (parseFloat(input.value) || 0) - 1);
      });
      plus.addEventListener('click', () => {
        input.value = (parseFloat(input.value) || 0) + 1;
      });
      qtyWrap.append(minus, input, plus);
      qtyTd.appendChild(qtyWrap);
      tr.appendChild(qtyTd);
      // Unit select
      const unitTd = document.createElement('td');
      unitTd.className = 'unit-cell';
      const unitSel = document.createElement('select');
      unitSel.className = 'select select-bordered w-full';
      Object.keys(state.units).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = unitName(u);
        if (u === p.unit) opt.selected = true;
        unitSel.appendChild(opt);
      });
      unitTd.appendChild(unitSel);
      tr.appendChild(unitTd);
      // Category select
      const catTd = document.createElement('td');
      catTd.className = 'category-cell';
      const catSel = document.createElement('select');
      catSel.className = 'select select-bordered w-full';
      Object.keys(CATEGORY_KEYS).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = categoryName(c);
        if (c === (p.category || 'uncategorized')) opt.selected = true;
        catSel.appendChild(opt);
      });
      catTd.appendChild(catSel);
      tr.appendChild(catTd);
      // Storage select
      const storTd = document.createElement('td');
      storTd.className = 'storage-cell';
      const storSel = document.createElement('select');
      storSel.className = 'select select-bordered w-full';
      Object.keys(STORAGE_KEYS).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = storageName(s);
        if (s === (p.storage || 'pantry')) opt.selected = true;
        storSel.appendChild(opt);
      });
      storTd.appendChild(storSel);
      tr.appendChild(storTd);
      // Status icon
      const statusTd = document.createElement('td');
      statusTd.className = 'status-cell text-center';
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
    } else {
      const nameTd = document.createElement('td');
      nameTd.textContent = productName(p.name);
      tr.appendChild(nameTd);
      const qtyTd = document.createElement('td');
      qtyTd.textContent = formatPackQuantity(p);
      tr.appendChild(qtyTd);
      const unitTd = document.createElement('td');
      unitTd.textContent = unitName(p.unit);
      tr.appendChild(unitTd);
      const catTd = document.createElement('td');
      catTd.textContent = categoryName(p.category);
      tr.appendChild(catTd);
      const storTd = document.createElement('td');
      storTd.textContent = storageName(p.storage);
      tr.appendChild(storTd);
      const statusTd = document.createElement('td');
      const status = getStatusIcon(p);
      if (status) {
        statusTd.innerHTML = status.html;
        statusTd.title = status.title;
      }
      tr.appendChild(statusTd);
    }
    tbody && tbody.appendChild(tr);
  });

  // grouped view
  const container = document.getElementById('product-list');
  if (!container) return;
  container.innerHTML = '';
  const storages = {};
  data.forEach(p => {
    const storage = p.storage || 'pantry';
    const cat = p.category || 'uncategorized';
    storages[storage] = storages[storage] || {};
    storages[storage][cat] = storages[storage][cat] || [];
    storages[storage][cat].push(p);
  });
  Object.keys(storages)
    .sort((a, b) => storageName(a).localeCompare(storageName(b)))
    .forEach(stor => {
      const block = document.createElement('div');
      block.className = 'storage-block border border-base-300 rounded-lg p-4 mb-4';
      const h3 = document.createElement('h3');
      h3.className = 'text-2xl font-bold flex items-center gap-2';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${STORAGE_ICONS[stor] || ''} ${storageName(stor)}`;
      h3.appendChild(nameSpan);
      block.appendChild(h3);
      const content = document.createElement('div');
      Object.keys(storages[stor])
        .sort((a, b) => categoryName(a).localeCompare(categoryName(b)))
        .forEach(cat => {
          const table = document.createElement('table');
          table.className = 'table table-zebra w-full grouped-table';
          const thead = document.createElement('thead');
          const hr = document.createElement('tr');
          [t('table_header_name'), t('table_header_quantity'), t('table_header_unit'), t('table_header_status')].forEach(txt => {
            const th = document.createElement('th');
            th.textContent = txt;
            hr.appendChild(th);
          });
          thead.appendChild(hr);
          table.appendChild(thead);
          const tb = document.createElement('tbody');
          storages[stor][cat].forEach(p => {
            const tr = document.createElement('tr');
            const n = document.createElement('td');
            n.textContent = productName(p.name);
            const q = document.createElement('td');
            q.textContent = formatPackQuantity(p);
            const u = document.createElement('td');
            u.textContent = unitName(p.unit);
            const s = document.createElement('td');
            const ic = getStatusIcon(p);
            if (ic) { s.innerHTML = ic.html; s.title = ic.title; }
            tr.append(n, q, u, s);
            tb.appendChild(tr);
          });
          table.appendChild(tb);
          const header = document.createElement('h4');
          header.className = 'text-xl font-semibold mt-4 mb-2';
          header.textContent = categoryName(cat);
          content.appendChild(header);
          content.appendChild(table);
        });
      block.appendChild(content);
      container.appendChild(block);
    });
}
