import { t, state, productName, unitName, categoryName, storageName, formatPackQuantity, getStatusIcon, STORAGE_ICONS } from '../helpers.js';

export function renderProducts(data) {
  const tbody = document.querySelector('#product-table tbody');
  if (tbody) tbody.innerHTML = '';
  data.forEach((p, idx) => {
    const tr = document.createElement('tr');
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
          const categoryBlock = document.createElement('div');
          categoryBlock.className = 'category-block';
          const header = document.createElement('h4');
          header.className = 'text-xl font-semibold mt-4 mb-2';
          header.textContent = categoryName(cat);
          categoryBlock.appendChild(header);

          const table = document.createElement('table');
          table.className = 'table table-zebra w-full grouped-table';

          const colgroup = document.createElement('colgroup');
          ['grouped-col-name', 'grouped-col-qty', 'grouped-col-unit', 'grouped-col-status'].forEach(cls => {
            const col = document.createElement('col');
            col.className = cls;
            colgroup.appendChild(col);
          });
          table.appendChild(colgroup);

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

          categoryBlock.appendChild(table);
          content.appendChild(categoryBlock);
        });
      block.appendChild(content);
      container.appendChild(block);
    });
}
