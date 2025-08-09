import {
  t,
  state,
  formatPackQuantity,
  getStatusIcon,
  STORAGE_ICONS,
  CATEGORY_KEYS,
  CATEGORY_ORDER,
  STORAGE_KEYS,
  matchesFilter,
  stockLevel,
  normalizeProduct,
  fetchJson,
  isSpice,
  debounce
} from '../helpers.js';
import { toast } from './toast.js';

const APP = (window.APP = window.APP || {});

// --- delete selected handling
const deleteBtn = document.getElementById('delete-selected');
const deleteModal = document.getElementById('delete-modal');
const deleteSummary = document.getElementById('delete-summary');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');

function updateDeleteButton() {
  const selected = document.querySelectorAll('input.row-select:checked').length;
  if (deleteBtn) {
    deleteBtn.disabled = selected === 0;
    deleteBtn.textContent =
      selected > 0
        ? `${t('delete_selected_button')} (${selected})`
        : t('delete_selected_button');
  }
}

document.addEventListener('change', e => {
  if (e.target.matches('input.row-select')) updateDeleteButton();
});

deleteBtn?.addEventListener('click', () => {
  const selected = Array.from(document.querySelectorAll('input.row-select:checked'));
  if (selected.length === 0) return;
  deleteSummary.innerHTML = '';
  const list = document.createElement('ul');
  selected.forEach(cb => {
    const li = document.createElement('li');
    li.textContent = t(cb.dataset.name);
    list.appendChild(li);
  });
  deleteSummary.appendChild(list);
  deleteModal.showModal();
});

confirmDeleteBtn?.addEventListener('click', async e => {
  e.preventDefault();
  const btn = confirmDeleteBtn;
  const selected = Array.from(document.querySelectorAll('input.row-select:checked'));
  const names = selected.map(cb => cb.dataset.name);
  if (names.length === 0) return;
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    await Promise.all(
      names.map(name => fetchJson(`/api/products/${encodeURIComponent(name)}`, { method: 'DELETE' }))
    );
    await refreshProducts();
  } catch (err) {
    toast.error(t('notify_error_title'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
    deleteModal.close();
    updateDeleteButton();
  }
});

cancelDeleteBtn?.addEventListener('click', e => {
  e.preventDefault();
  deleteModal.close();
});

document.addEventListener('click', (e) => {
  if (e.target.closest('.qty-inc')) adjustRow(e.target.closest('tr'), 1);
  if (e.target.closest('.qty-dec')) adjustRow(e.target.closest('tr'), -1);
});

// --- expand/collapse state
const storageState = new Map(); // storageId -> true/false
const categoryState = new Map(); // storageId::categoryId -> true/false

function animateSection(el, show) {
  if (!el) return;
  const mb = el.dataset.mb || getComputedStyle(el).marginBottom;
  el.dataset.mb = mb;
  el.style.overflow = 'hidden';
  if (show) {
    el.classList.remove('hidden');
    el.style.marginBottom = mb;
    const h = el.scrollHeight;
    el.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      el.style.transition = 'max-height 0.3s ease';
      el.style.maxHeight = `${h}px`;
    });
    el.addEventListener(
      'transitionend',
      () => {
        el.style.maxHeight = '';
        el.style.transition = '';
        el.style.overflow = '';
        el.style.marginBottom = '';
      },
      { once: true }
    );
  } else {
    const h = el.scrollHeight;
    el.style.maxHeight = `${h}px`;
    el.style.marginBottom = '0px';
    requestAnimationFrame(() => {
      el.style.transition = 'max-height 0.3s ease';
      el.style.maxHeight = '0px';
    });
    el.addEventListener(
      'transitionend',
      () => {
        el.classList.add('hidden');
        el.style.maxHeight = '';
        el.style.transition = '';
        el.style.overflow = '';
      },
      { once: true }
    );
  }
}

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
  syncAllToggles(container, false);
}

function syncAllToggles(container, animate = true) {
  container.querySelectorAll('.storage-section').forEach(sec => {
    const storage = sec.dataset.storage;
    const storageOpen = !!storageState.get(storage);
    setStorageUI(sec, storageOpen, animate);
  });
}

function setStorageUI(storageSection, open, animate = true) {
  const btn = storageSection.querySelector('.toggle-storage');
  btn.setAttribute('aria-expanded', String(open));
  btn.title = open ? t('collapse') : t('expand');
  const icon = btn.querySelector('i');
  icon.classList.add('transition-transform');
  icon.classList.toggle('rotate-180', open);

  storageSection.querySelectorAll('.category-section').forEach(cat => {
    const key = `${storageSection.dataset.storage}::${cat.dataset.category}`;
    const catOpen = !!categoryState.get(key);
    if (open) {
      setCategoryUI(cat, catOpen, false);
      if (animate) animateSection(cat, true);
      else cat.classList.remove('hidden');
    } else {
      if (animate) animateSection(cat, false);
      else cat.classList.add('hidden');
    }
  });
}

function setCategoryUI(categorySection, open, animate = true) {
  const btn = categorySection.querySelector('.toggle-category');
  btn.setAttribute('aria-expanded', String(open));
  btn.title = open ? t('collapse') : t('expand');
  const icon = btn.querySelector('i');
  icon.classList.add('transition-transform');
  icon.classList.toggle('rotate-180', open);
  const body = categorySection.querySelector('.category-body');
  if (animate) animateSection(body, open);
  else body.classList.toggle('hidden', !open);
}
function highlightRow(tr, p) {
  tr.classList.remove('product-low', 'product-missing');
  const level = stockLevel(p);
  if (level === 'low') tr.classList.add('product-low');
  if (level === 'none') tr.classList.add('product-missing');
}

function adjustRow(tr, delta) {
  const input = tr.querySelector('.qty-input');
  if (!input) return;
  const val = Number(input.value || 0);
  const next = Math.max(0, val + delta);
  input.value = next;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function buildQtyCell(p, tr) {
  const td = document.createElement('td');
  td.className = 'qty-cell';
  if (isSpice(p)) {
    const wrap = document.createElement('div');
    wrap.className = 'flex gap-2';
    ['none', 'low', 'medium', 'high'].forEach(l => {
      const label = document.createElement('label');
      label.className = 'cursor-pointer flex items-center gap-1';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `level-${p.name}`;
      input.value = l;
      if (p.level === l) input.checked = true;
      input.addEventListener('change', () => {
        p.level = l;
        highlightRow(tr, p);
      });
      const span = document.createElement('span');
      span.dataset.i18n = `level.${l}`;
      span.textContent = t(`level.${l}`);
      label.appendChild(input);
      label.appendChild(span);
      wrap.appendChild(label);
    });
    td.appendChild(wrap);
    return td;
  }
  const wrap = document.createElement('div');
  wrap.className = 'qty-wrap';
  const dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'btn-qty qty-dec';
  dec.textContent = '−';
  const input = document.createElement('input');
  input.className = 'qty-input no-spinner';
  input.type = 'number';
  input.step = '1';
  input.inputMode = 'numeric';
  input.min = '0';
  input.value = p.quantity;
  input.addEventListener(
    'input',
    debounce(() => {
      if (input.value !== '' && parseFloat(input.value) < 0) input.value = '0';
    }, 150)
  );
  input.addEventListener('change', () => {
    const val = Math.max(0, parseFloat(input.value) || 0);
    p.quantity = val;
    input.value = val;
    highlightRow(tr, p);
  });
  const inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'btn-qty qty-inc';
  inc.textContent = '+';
  wrap.append(dec, input, inc);
  td.appendChild(wrap);
  return td;
}

export async function refreshProducts() {
  try {
    const data = await fetchJson('/api/products');
    APP.state.products = data.map(normalizeProduct);
    renderProducts();
  } catch (err) {
    toast.error(t('notify_error_title'));
  }
}

export async function saveProduct(payload) {
  try {
    await fetchJson('/api/products', {
      method: 'POST',
      body: payload
    });
    await refreshProducts();
    toast.success(t('save_success'), '', {
      label: t('toast_go_products'),
      onClick: () => {
        window.activateTab('tab-products');
        localStorage.setItem('activeTab', 'tab-products');
        history.pushState({ tab: 'tab-products' }, '');
      }
    });
  } catch (err) {
    toast.error(t('notify_error_title'));
  }
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
    nameTd.textContent = t(p.name);
    tr.appendChild(nameTd);
    // quantity with steppers
    const qtyTd = buildQtyCell(p, tr);
    tr.appendChild(qtyTd);
    // unit select
    const unitTd = document.createElement('td');
    unitTd.className = 'unit-cell';
    if (isSpice(p)) {
      unitTd.textContent = '';
    } else {
      const unitSel = document.createElement('select');
      unitSel.className = 'select select-bordered w-full';
      Object.keys(state.units).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = t(u);
        if (u === p.unit) opt.selected = true;
        unitSel.appendChild(opt);
      });
      unitTd.appendChild(unitSel);
    }
    tr.appendChild(unitTd);
    // category select
    const catTd = document.createElement('td');
    catTd.className = 'category-cell';
    const catSel = document.createElement('select');
    catSel.className = 'select select-bordered w-full';
    Object.keys(CATEGORY_KEYS).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = t(CATEGORY_KEYS[c] || c);
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
      opt.textContent = t(STORAGE_KEYS[s] || s);
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
    nameTd.textContent = t(p.name);
    tr.appendChild(nameTd);
    const qtyTd = document.createElement('td');
    qtyTd.textContent = formatPackQuantity(p);
    tr.appendChild(qtyTd);
    const unitTd = document.createElement('td');
    unitTd.textContent = isSpice(p) ? '' : t(p.unit);
    tr.appendChild(unitTd);
    const catTd = document.createElement('td');
    catTd.textContent = t(CATEGORY_KEYS[p.category] || p.category);
    tr.appendChild(catTd);
    const storTd = document.createElement('td');
    storTd.textContent = t(STORAGE_KEYS[p.storage] || p.storage);
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
  const {
    products = [],
    view = 'flat',
    filter = 'all',
    editing = false,
    search = ''
  } = APP.state || {};
  const data = Array.isArray(products) ? products.filter(p => p && p.name) : [];
  const term = (search || '').toLowerCase();
  const filtered = data.filter(
    p => matchesFilter(p, filter) && (!term || t(p.name).toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
  );

  const table = document.getElementById('product-table');
  const list = document.getElementById('products-by-category');
  if (!table || !list) return;
  requestAnimationFrame(() => {
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
        updateDeleteButton();
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
        updateDeleteButton();
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
        .sort((a, b) => t(STORAGE_KEYS[a] || a).localeCompare(t(STORAGE_KEYS[b] || b)))
        .forEach(stor => {
          const block = document.createElement('section');
          block.className = 'storage-section storage-block border border-base-300 rounded-lg p-4 mb-4';
          block.dataset.storage = stor;

          const header = document.createElement('header');
          header.className = 'storage-header flex items-center gap-2';
          if (state.displayMode === 'mobile') header.classList.add('cursor-pointer');
          const nameSpan = document.createElement('span');
          nameSpan.className = 'inline-flex items-center text-xl font-semibold';
          nameSpan.textContent = `${STORAGE_ICONS[stor] || ''} ${t(STORAGE_KEYS[stor] || stor)}`;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'toggle-storage ml-auto h-8 w-8 flex items-center justify-center';
          btn.setAttribute('aria-expanded', 'true');
          btn.setAttribute('title', t('collapse'));
          btn.innerHTML = '<i class="fa-regular fa-caret-down transition-transform rotate-180"></i>';
          header.append(nameSpan, btn);
          block.appendChild(header);

          Object.keys(storages[stor])
            .sort((a, b) => (CATEGORY_ORDER[a] || 0) - (CATEGORY_ORDER[b] || 0) || t(CATEGORY_KEYS[a] || a).localeCompare(t(CATEGORY_KEYS[b] || b)))
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
              catSpan.textContent = t(CATEGORY_KEYS[cat] || cat);
              const catBtn = document.createElement('button');
              catBtn.type = 'button';
              catBtn.className = 'toggle-category ml-auto h-8 w-8 flex items-center justify-center';
              catBtn.setAttribute('aria-expanded', 'true');
              catBtn.setAttribute('title', t('collapse'));
              catBtn.innerHTML = '<i class="fa-regular fa-caret-down transition-transform rotate-180"></i>';
              catHeader.append(catSpan, catBtn);
              catBlock.appendChild(catHeader);

              const body = document.createElement('div');
              body.className = 'category-body';
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
              const headers = editing
                ? ['', t('table_header_name'), t('table_header_quantity'), t('table_header_unit'), t('table_header_status')]
                : [t('table_header_name'), t('table_header_quantity'), t('table_header_unit'), t('table_header_status')];
              headers.forEach((txt, i) => {
                const th = document.createElement('th');
                th.textContent = txt;
                // Reserve a header column for the checkbox when editing so
                // column alignment matches body rows.
                if (editing && i === 0) th.className = 'checkbox-cell';
                hr.appendChild(th);
              });
              thead.appendChild(hr);
              table.appendChild(thead);
              const tb = document.createElement('tbody');
              storages[stor][cat].forEach(p => {
                const tr = document.createElement('tr');
                const idx = data.indexOf(p);
                tr.dataset.index = idx;
                tr.dataset.productId = p.id != null ? p.id : idx;
                if (editing) {
                  const cbTd = document.createElement('td');
                  cbTd.className = 'checkbox-cell';
                  const cb = document.createElement('input');
                  cb.type = 'checkbox';
                  // Same checkbox styling as flat view so delete logic works.
                  cb.className = 'checkbox checkbox-sm row-select product-select';
                  cb.dataset.name = p.name;
                  cbTd.appendChild(cb);
                  tr.appendChild(cbTd);
                  const n = document.createElement('td');
                  n.textContent = t(p.name);
                  tr.appendChild(n);
                  const q = buildQtyCell(p, tr);
                  tr.appendChild(q);
                  const u = document.createElement('td');
                  u.textContent = t(p.unit);
                  tr.appendChild(u);
                  const s = document.createElement('td');
                  const ic = getStatusIcon(p);
                  if (ic) {
                    s.innerHTML = ic.html;
                    s.title = ic.title;
                  }
                  tr.appendChild(s);
                } else {
                  const n = document.createElement('td');
                  n.textContent = t(p.name);
                  const q = document.createElement('td');
                  q.textContent = formatPackQuantity(p);
                  const u = document.createElement('td');
                  u.textContent = t(p.unit);
                  const s = document.createElement('td');
                  const ic = getStatusIcon(p);
                  if (ic) {
                    s.innerHTML = ic.html;
                    s.title = ic.title;
                  }
                  tr.append(n, q, u, s);
                }
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
    updateDeleteButton();
  });
}

const groupedRoot = document.getElementById('products-by-category');
if (groupedRoot) {
  initExpandDefaults(groupedRoot);

  groupedRoot.addEventListener('click', e => {
    // Disable expand/collapse interactions while editing.
    if (APP.state.editing) return;
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
      setCategoryUI(section, parentOpen && categoryState.get(key), parentOpen);
    }
  });

  // Mobile: tap entire header toggles
  groupedRoot.addEventListener('click', e => {
    // Ignore header toggle taps while editing.
    if (APP.state.editing) return;
    const hdr = e.target.closest('.category-header, .storage-header');
    if (!hdr) return;
    const btn = hdr.querySelector('.toggle-category, .toggle-storage');
    if (btn && window.matchMedia('(max-width: 768px)').matches) btn.click();
  });
}
