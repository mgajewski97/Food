import { t, state, productName, unitName, categoryName, storageName, formatPackQuantity, getStatusIcon, STORAGE_ICONS, CATEGORY_KEYS, STORAGE_KEYS, matchesFilter, stockLevel } from '../helpers.js';

const APP = (window.APP = window.APP || {});

const deleteBtn = document.getElementById('delete-selected'); // label: "Usuń zaznaczone"
function updateDeleteButton() {
  const selected = document.querySelectorAll('input.row-select:checked').length;
  deleteBtn.disabled = selected === 0;
  deleteBtn.textContent = selected > 0 ? `Usuń zaznaczone (${selected})` : 'Usuń zaznaczone';
}
document.addEventListener('change', (e) => {
  if (e.target.matches('input.row-select')) updateDeleteButton();
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'end-edit') { /* leaving edit mode */ updateDeleteButton(); }
});

// --- expand/collapse state
const storageState = new Map(); // storageId -> true/false
const categoryState = new Map(); // storageId::categoryId -> true/false

// ensure default: everything expanded on first render
function initExpandDefaults(container) {
  container.querySelectorAll('.storage-section').forEach(sec => {
    const storage = sec.dataset.storage;
    if (!storageState.has(storage)) storageState.set(storage, true);
    sec.querySelectorAll('.category-section').forEach(cat => {
      const key = `${storage}::${cat.dataset.category}`;
      if (!categoryState.has(key)) categoryState.set(key, true);
    });
  });
  syncAllToggles(container);
}

function syncAllToggles(container) {
  container.querySelectorAll('.storage-section').forEach(sec => {
    const storage = sec.dataset.storage;
    const storageOpen = !!storageState.get(storage);
    setStorageUI(sec, storageOpen);
    sec.querySelectorAll('.category-section').forEach(cat => {
      const key = `${storage}::${cat.dataset.category}`;
      const catOpen = !!categoryState.get(key);
      setCategoryUI(cat, storageOpen && catOpen);
    });
  });
}

function setStorageUI(storageSection, open) {
  const btn = storageSection.querySelector('.toggle-storage');
  btn.setAttribute('aria-expanded', String(open));
  btn.title = open ? t('collapse') : t('expand');
  const icon = btn.querySelector('i');
  icon.classList.toggle('fa-caret-up', open);
  icon.classList.toggle('fa-caret-down', !open);

  storageSection.querySelectorAll('.category-section').forEach(cat => {
    const key = `${storageSection.dataset.storage}::${cat.dataset.category}`;
    const catOpen = !!categoryState.get(key);
    setCategoryUI(cat, open && catOpen);
  });
}

function setCategoryUI(categorySection, open) {
  const btn = categorySection.querySelector('.toggle-category');
  btn.setAttribute('aria-expanded', String(open));
  btn.title = open ? t('collapse') : t('expand');
  const icon = btn.querySelector('i');
  icon.classList.toggle('fa-caret-up', open);
  icon.classList.toggle('fa-caret-down', !open);
  categorySection.querySelector('.category-body').classList.toggle('hidden', !open);
}
function highlightRow(tr, p) {
  const level = stockLevel(p);
  if (level === 'low') tr.classList.add('product-low');
  if (level === 'none') tr.classList.add('product-missing');
}

function adjustRow(input, product, delta) {
  const newVal = Math.max(0, (parseFloat(input.value) || 0) + delta);
  input.value = newVal;
  product.quantity = newVal;
}

function createFlatRow(p, idx, editable) {
  const tr = document.createElement('tr');
  tr.dataset.index = idx;
  if (editable) {
    // checkbox
    const cbTd = document.createElement('td');
    cbTd.className = 'checkbox-cell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'checkbox checkbox-sm row-select';
    cb.dataset.name = p.name;
    cbTd.appendChild(cb);
    tr.appendChild(cbTd);
    // name
    const nameTd = document.createElement('td');
    nameTd.className = 'name-cell';
    nameTd.textContent = productName(p.name);
    tr.appendChild(nameTd);
    // quantity with steppers
    const qtyTd = document.createElement('td');
    qtyTd.className = 'qty-cell';
    qtyTd.innerHTML = `
      <div class="qty-wrap">
        <button type="button" class="btn-qty qty-dec">−</button>
        <input class="qty-input" type="number" step="1" inputmode="numeric" />
        <button type="button" class="btn-qty qty-inc">+</button>
      </div>
    `;
    const input = qtyTd.querySelector('.qty-input');
    const dec = qtyTd.querySelector('.qty-dec');
    const inc = qtyTd.querySelector('.qty-inc');
    input.value = p.quantity;
    dec.addEventListener('click', () => adjustRow(input, p, -1));
    inc.addEventListener('click', () => adjustRow(input, p, 1));
    input.addEventListener('change', () => {
      p.quantity = parseFloat(input.value) || 0;
    });
    tr.appendChild(qtyTd);
    // unit select
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
    // category select
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
    // storage select
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
    // status
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
  highlightRow(tr, p);
  return tr;
}

export function renderProducts() {
  const { products = [], view = 'flat', filter = 'all', editing = false } = APP.state || {};
  const data = Array.isArray(products) ? products.filter(p => p && p.name) : [];
  const filtered = data.filter(p => matchesFilter(p, filter));

  const table = document.getElementById('product-table');
  const list = document.getElementById('products-by-category');
  if (!table || !list) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  list.innerHTML = '';

  if (view === 'flat') {
    table.style.display = '';
    list.style.display = 'none';
    table.classList.toggle('edit-mode', editing);
    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = editing ? 7 : 6;
      td.className = 'text-center';
      td.textContent = t('products_empty');
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    filtered.forEach((p, idx) => {
      const tr = createFlatRow(p, idx, editing);
      tbody.appendChild(tr);
    });
  } else {
    table.style.display = 'none';
    list.style.display = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'p-4 text-center text-base-content/70';
      empty.textContent = t('products_empty');
      list.appendChild(empty);
      return;
    }
    const storages = {};
    filtered.forEach(p => {
      const s = p.storage || 'pantry';
      const c = p.category || 'uncategorized';
      storages[s] = storages[s] || {};
      storages[s][c] = storages[s][c] || [];
      storages[s][c].push(p);
    });
    Object.keys(storages)
      .sort((a, b) => storageName(a).localeCompare(storageName(b)))
      .forEach(stor => {
        const block = document.createElement('section');
        block.className = 'storage-section storage-block border border-base-300 rounded-lg p-4 mb-4';
        block.dataset.storage = stor;

        const header = document.createElement('header');
        header.className = 'storage-header flex items-center gap-2';
        if (state.displayMode === 'mobile') header.classList.add('cursor-pointer');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'inline-flex items-center text-xl font-semibold';
        nameSpan.textContent = `${STORAGE_ICONS[stor] || ''} ${storageName(stor)}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toggle-storage ml-auto h-8 w-8 flex items-center justify-center';
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('title', t('collapse'));
        btn.innerHTML = '<i class="fa-regular fa-caret-up"></i>';
        header.append(nameSpan, btn);
        block.appendChild(header);

        Object.keys(storages[stor])
          .sort((a, b) => categoryName(a).localeCompare(categoryName(b)))
          .forEach(cat => {
            const catBlock = document.createElement('div');
            catBlock.className = 'category-section category-block';
            catBlock.dataset.storage = stor;
            catBlock.dataset.category = cat;

            const catHeader = document.createElement('header');
            catHeader.className = 'category-header flex items-center gap-2';
            if (state.displayMode === 'mobile') catHeader.classList.add('cursor-pointer');
            const catSpan = document.createElement('span');
            catSpan.className = 'font-medium';
            catSpan.textContent = categoryName(cat);
            const catBtn = document.createElement('button');
            catBtn.type = 'button';
            catBtn.className = 'toggle-category ml-auto h-8 w-8 flex items-center justify-center';
            catBtn.setAttribute('aria-expanded', 'true');
            catBtn.setAttribute('title', t('collapse'));
            catBtn.innerHTML = '<i class="fa-regular fa-caret-up"></i>';
            catHeader.append(catSpan, catBtn);
            catBlock.appendChild(catHeader);

            const body = document.createElement('div');
            body.className = 'category-body';
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
              if (ic) {
                s.innerHTML = ic.html;
                s.title = ic.title;
              }
              tr.append(n, q, u, s);
              highlightRow(tr, p);
              tb.appendChild(tr);
            });
            table.appendChild(tb);
            body.appendChild(table);
            catBlock.appendChild(body);
            block.appendChild(catBlock);
          });

        list.appendChild(block);
      });
    initExpandDefaults(list);
  }
}

const groupedRoot = document.getElementById('products-by-category');
if (groupedRoot) {
  initExpandDefaults(groupedRoot);

  groupedRoot.addEventListener('click', e => {
    const storageBtn = e.target.closest('.toggle-storage');
    const catBtn = e.target.closest('.toggle-category');

    if (storageBtn) {
      e.stopPropagation();
      const section = storageBtn.closest('.storage-section');
      const id = section.dataset.storage;
      storageState.set(id, !storageState.get(id));
      setStorageUI(section, storageState.get(id));
    }

    if (catBtn) {
      e.stopPropagation();
      const section = catBtn.closest('.category-section');
      const storage = section.dataset.storage;
      const cat = section.dataset.category;
      const key = `${storage}::${cat}`;
      categoryState.set(key, !categoryState.get(key));
      const parentOpen = !!storageState.get(storage);
      setCategoryUI(section, parentOpen && categoryState.get(key));
    }
  });

  // Mobile: tap entire header toggles
  groupedRoot.addEventListener('click', e => {
    const hdr = e.target.closest('.category-header, .storage-header');
    if (!hdr) return;
    const btn = hdr.querySelector('.toggle-category, .toggle-storage');
    if (btn && window.matchMedia('(max-width: 768px)').matches) btn.click();
  });
}
