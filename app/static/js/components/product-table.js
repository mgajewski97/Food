import { t, state, productName, unitName, categoryName, storageName, formatPackQuantity, getStatusIcon, STORAGE_ICONS, CATEGORY_KEYS, STORAGE_KEYS, matchesFilter, stockLevel } from '../helpers.js';

const APP = (window.APP = window.APP || {});

export const editState = { editing: false };

export function enterEditMode() {
  editState.editing = true;
  document.body.classList.add('editing');
  document.querySelectorAll('.row-select').forEach(cb => cb.classList.remove('hidden-in-view'));
  updateDeleteButton();
}

export function exitEditMode() {
  editState.editing = false;
  document.body.classList.remove('editing');
  document.querySelectorAll('.row-select').forEach(cb => cb.classList.add('hidden-in-view'));
  updateDeleteButton();
}

export function updateDeleteButton() {
  const btn = document.getElementById('delete-selected');
  if (!btn) return;
  const count = document.querySelectorAll('.row-select:checked').length;
  btn.disabled = count === 0;
}

function highlightRow(tr, p) {
  const level = stockLevel(p);
  if (level === 'low') tr.classList.add('product-low');
  if (level === 'none') tr.classList.add('product-missing');
}

function createFlatRow(p, idx, editable) {
  const tr = document.createElement('tr');
  tr.dataset.productId = idx;
  if (editable) {
    const cbTd = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'row-select checkbox checkbox-sm';
    cb.dataset.name = p.name;
    cbTd.appendChild(cb);
    tr.appendChild(cbTd);

    const nameTd = document.createElement('td');
    nameTd.className = 'name-cell';
    nameTd.textContent = productName(p.name);
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    qtyTd.className = 'qty-cell';
    const wrap = document.createElement('div');
    wrap.className = 'qty-wrap flex items-center gap-2 h-10';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'btn-qty qty-dec';
    minus.textContent = '−';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.inputMode = 'numeric';
    input.className = 'qty-input input input-bordered w-12 h-10 text-center no-spinner';
    input.value = p.quantity;
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'btn-qty qty-inc';
    plus.textContent = '+';
    wrap.append(minus, input, plus);
    qtyTd.appendChild(wrap);
    tr.appendChild(qtyTd);

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

function attachCollapses(root) {
  root.querySelectorAll('[data-collapse]').forEach(btn => {
    const targetId = btn.getAttribute('aria-controls');
    const target = root.querySelector(`#${targetId}`);
    const icon = btn.querySelector('i');
    const header = btn.parentElement;
    const parts = targetId.split('-').slice(1); // drop leading "storage"
    const isStorage = parts.length === 1;
    const key = isStorage ? parts[0] : parts.join('-');
    const store = isStorage ? state.expandedStorages : state.expandedCategories;
    if (store[key] === false) {
      target?.classList.add('hidden');
      icon.classList.remove('fa-caret-up');
      icon.classList.add('fa-caret-down');
      btn.setAttribute('title', t('expand'));
    } else {
      btn.setAttribute('title', t('collapse'));
    }

    function toggle() {
      const isHidden = target?.classList.toggle('hidden');
      icon.classList.toggle('fa-caret-up', !isHidden);
      icon.classList.toggle('fa-caret-down', isHidden);
      btn.setAttribute('title', t(isHidden ? 'expand' : 'collapse'));
      store[key] = !isHidden;
    }

    btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    if (header && state.displayMode === 'mobile') {
      header.addEventListener('click', toggle);
    }
  });
}

export function renderProducts() {
  const { products = [], view = 'flat', filter = 'all', editing = false } = APP.state || {};
  const filtered = [];
  products.forEach((p, idx) => {
    if (p && p.name && matchesFilter(p, filter)) filtered.push({ p, idx });
  });

  const table = document.getElementById('product-table');
  const list = document.getElementById('product-list');
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
    filtered.forEach(({ p, idx }) => {
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
    filtered.forEach(({ p, idx }) => {
      const s = p.storage || 'pantry';
      const c = p.category || 'uncategorized';
      storages[s] = storages[s] || {};
      storages[s][c] = storages[s][c] || [];
      storages[s][c].push({ p, idx });
    });
    Object.keys(storages)
      .sort((a, b) => storageName(a).localeCompare(storageName(b)))
      .forEach(stor => {
        const block = document.createElement('div');
        block.className = 'storage-block border border-base-300 rounded-lg p-4 mb-4';
        const header = document.createElement('h3');
        header.className = 'text-2xl font-bold flex items-center gap-2';
        if (state.displayMode === 'mobile') header.classList.add('cursor-pointer');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${STORAGE_ICONS[stor] || ''} ${storageName(stor)}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ml-auto';
        btn.innerHTML = '<i class="fa-regular fa-caret-up"></i>';
        btn.setAttribute('data-collapse', '');
        const contentId = `storage-${stor}`;
        btn.setAttribute('aria-controls', contentId);
        btn.setAttribute('title', t('collapse'));
        header.append(nameSpan, btn);
        block.appendChild(header);
        const content = document.createElement('div');
        content.id = contentId;
        Object.keys(storages[stor])
          .sort((a, b) => categoryName(a).localeCompare(categoryName(b)))
          .forEach(cat => {
            const catBlock = document.createElement('div');
            catBlock.className = 'category-block';
            const catHeader = document.createElement('h4');
            catHeader.className = 'text-xl font-semibold mt-4 mb-2 flex items-center gap-2';
            if (state.displayMode === 'mobile') catHeader.classList.add('cursor-pointer');
            const catSpan = document.createElement('span');
            catSpan.textContent = categoryName(cat);
            const catBtn = document.createElement('button');
            catBtn.type = 'button';
            catBtn.className = 'ml-auto';
            catBtn.innerHTML = '<i class="fa-regular fa-caret-up"></i>';
            const catId = `${contentId}-${cat}`;
            catBtn.setAttribute('data-collapse', '');
            catBtn.setAttribute('aria-controls', catId);
            catBtn.setAttribute('title', t('collapse'));
            catHeader.append(catSpan, catBtn);
            catBlock.appendChild(catHeader);
            const tableWrap = document.createElement('div');
            tableWrap.id = catId;
            const table = document.createElement('table');
            table.className = 'table table-zebra w-full grouped-table';
            const colgroup = document.createElement('colgroup');
            const cols = editing
              ? ['grouped-col-select', 'grouped-col-name', 'grouped-col-qty', 'grouped-col-unit', 'grouped-col-status']
              : ['grouped-col-name', 'grouped-col-qty', 'grouped-col-unit', 'grouped-col-status'];
            cols.forEach(cls => {
              const col = document.createElement('col');
              col.className = cls;
              colgroup.appendChild(col);
            });
            table.appendChild(colgroup);
            const thead = document.createElement('thead');
            const hr = document.createElement('tr');
            if (editing) {
              hr.appendChild(document.createElement('th'));
            }
            [t('table_header_name'), t('table_header_quantity'), t('table_header_unit'), t('table_header_status')].forEach(txt => {
              const th = document.createElement('th');
              th.textContent = txt;
              hr.appendChild(th);
            });
            thead.appendChild(hr);
            table.appendChild(thead);
            const tb = document.createElement('tbody');
            const rowTpl = document.getElementById('grouped-row-template');
            storages[stor][cat].forEach(({ p, idx }) => {
              let tr;
              if (editing && rowTpl) {
                tr = rowTpl.content.firstElementChild.cloneNode(true);
                tr.dataset.productId = idx;
                tr.querySelector('.name-cell').textContent = productName(p.name);
                const input = tr.querySelector('.qty-input');
                input.value = p.quantity;
                tr.querySelector('.unit-cell').textContent = unitName(p.unit);
                const s = tr.querySelector('.status-cell');
                const ic = getStatusIcon(p);
                if (ic) { s.innerHTML = ic.html; s.title = ic.title; }
              } else {
                tr = document.createElement('tr');
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
              }
              highlightRow(tr, p);
              tb.appendChild(tr);
            });
            table.appendChild(tb);
            tableWrap.appendChild(table);
            catBlock.appendChild(tableWrap);
            content.appendChild(catBlock);
          });
        block.appendChild(content);
        list.appendChild(block);
      });
    attachCollapses(list);
  }
  if (editing) enterEditMode(); else exitEditMode();
}

function adjustRow(tr, delta) {
  const input = tr?.querySelector('.qty-input');
  if (!input) return;
  const val = Number(input.value || 0);
  const next = Math.max(0, val + delta);
  input.value = next;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('click', e => {
  const inc = e.target.closest('.qty-inc');
  const dec = e.target.closest('.qty-dec');
  if (inc) adjustRow(inc.closest('tr'), +1);
  if (dec) adjustRow(dec.closest('tr'), -1);
});

document.addEventListener('change', e => {
  if (e.target.matches('.row-select')) updateDeleteButton();
  if (e.target.matches('.qty-input')) {
    const tr = e.target.closest('tr');
    const id = Number(tr?.dataset.productId);
    const p = APP.state.products[id];
    if (p) p.quantity = Number(e.target.value) || 0;
  }
});
