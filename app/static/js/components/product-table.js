import {
  t,
  state,
  formatPackQuantity,
  getStatusIcon,
  STORAGE_ICONS,
  CATEGORY_ORDER,
  STORAGE_KEYS,
  matchesFilter,
  getStockState,
  normalizeProduct,
  fetchJson,
  isSpice,
  debounce,
  debounceFrame,
  dlog,
  getProduct,
  DEBUG,
  loadProductFilters,
  saveProductFilters,
  toggleFavorite,
} from "../helpers.js";
import { toast } from "./toast.js";

const APP = (window.APP = window.APP || {});

const productPager = {
  page: 1,
  page_size: 50,
  sort_by: "name",
  order: "asc",
  total: 0,
};

let storageFilter,
  statusFilter,
  categoryFilter,
  searchInput,
  searchClear,
  chipsContainer;

// --- bulk selection handling
const selectedProducts = new Set();
APP.selectedProducts = selectedProducts;
let bulkBar;
let bulkCount;
let bulkButtons = [];

// cache flat view rows to minimize DOM churn
const flatRowCache = new Map();
let flatCacheEditing = false;

function updateBulkActions() {
  const count = selectedProducts.size;
  const editing = APP.state?.editing;
  if (bulkBar) bulkBar.style.display = count > 0 && editing ? "flex" : "none";
  if (bulkCount)
    bulkCount.textContent = count > 0 ? `${count} selected` : "";
  bulkButtons.forEach((btn) => {
    if (btn) btn.disabled = count === 0;
  });
  const headCells = document.querySelectorAll("#product-table thead th");
  headCells.forEach((th) => {
    th.style.top = count > 0 && bulkBar && editing ? `${bulkBar.offsetHeight}px` : "0";
  });
}

function updateSortIcons() {
  document
    .querySelectorAll('#product-table thead th[data-sort-by] i')
    .forEach((icon) => {
      icon.className = 'fa-solid fa-sort opacity-50';
    });
  const active = document.querySelector(
    `#product-table thead th[data-sort-by="${state.productSortField}"] i`,
  );
  if (active) {
    active.className =
      state.productSortDir === 'asc'
        ? 'fa-solid fa-sort-up'
        : 'fa-solid fa-sort-down';
  }
}

function saveFilters() {
  saveProductFilters({
    storage: APP.state.filterStorage || '',
    status: APP.state.filterStatus || '',
    category: APP.state.filterCategory || '',
    search: APP.state.search || '',
  });
  APP.searches = APP.searches || {};
  APP.searches['tab-products'] = APP.state.search || '';
}

function renderActiveFilterChips() {
  if (!chipsContainer) chipsContainer = document.getElementById('active-filters');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = '';
  const chips = [];
  if (APP.state.filterStorage) {
    chips.push({
      type: 'storage',
      label: t(STORAGE_KEYS[APP.state.filterStorage] || APP.state.filterStorage),
    });
  }
  if (APP.state.filterStatus) {
    chips.push({
      type: 'status',
      label: t(`state_filter_${APP.state.filterStatus}`),
    });
  }
  if (APP.state.filterCategory) {
    chips.push({
      type: 'category',
      label: t(APP.state.filterCategory, 'categories'),
    });
  }
  if (APP.state.search) {
    chips.push({ type: 'search', label: APP.state.search });
  }
  chips.forEach((c) => {
    const span = document.createElement('span');
    span.className = 'badge badge-outline filter-chip flex items-center gap-1';
    span.dataset.filter = c.type;
    span.textContent = c.label;
    const i = document.createElement('i');
    i.className = 'fa-solid fa-xmark';
    span.appendChild(i);
    chipsContainer.appendChild(span);
  });
  chipsContainer.style.display = chips.length ? 'flex' : 'none';
}

function populateCategories() {
  if (!categoryFilter) categoryFilter = document.getElementById('category-filter');
  if (!categoryFilter) return;
  const cats = Object.keys(state.domain.categories || {});
  categoryFilter.innerHTML = '<option value="">All</option>';
  cats
    .sort((a, b) => t(a, 'categories').localeCompare(t(b, 'categories')))
    .forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = t(k, 'categories');
      categoryFilter.appendChild(opt);
    });
}

function initFilterControls() {
  storageFilter = document.getElementById('storage-filter');
  statusFilter = document.getElementById('status-filter');
  categoryFilter = document.getElementById('category-filter');
  searchInput = document.getElementById('product-search-input');
  searchClear = document.getElementById('search-clear');
  chipsContainer = document.getElementById('active-filters');

  populateCategories();

  const saved = loadProductFilters();
  APP.state.filterStorage = saved.storage || '';
  APP.state.filterStatus = saved.status || '';
  APP.state.filterCategory = saved.category || '';
  APP.state.search = saved.search || '';
  APP.searches = APP.searches || {};
  APP.searches['tab-products'] = APP.state.search;

  if (storageFilter) storageFilter.value = APP.state.filterStorage;
  if (statusFilter) statusFilter.value = APP.state.filterStatus;
  if (categoryFilter) categoryFilter.value = APP.state.filterCategory;
  if (searchInput) {
    searchInput.value = APP.state.search;
    searchClear?.classList.toggle('hidden', !APP.state.search);
  }

  storageFilter?.addEventListener('change', () => {
    APP.state.filterStorage = storageFilter.value;
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
  });
  statusFilter?.addEventListener('change', () => {
    APP.state.filterStatus = statusFilter.value;
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
  });
  categoryFilter?.addEventListener('change', () => {
    APP.state.filterCategory = categoryFilter.value;
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
  });
  searchInput?.addEventListener('input', () => {
    const val = searchInput.value.trim().toLowerCase();
    APP.state.search = val;
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
    searchClear?.classList.toggle('hidden', !val);
  });
  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    APP.state.search = '';
    searchClear.classList.add('hidden');
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
  });
  chipsContainer?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    const type = chip.dataset.filter;
    if (type === 'storage') {
      APP.state.filterStorage = '';
      storageFilter && (storageFilter.value = '');
    } else if (type === 'status') {
      APP.state.filterStatus = '';
      statusFilter && (statusFilter.value = '');
    } else if (type === 'category') {
      APP.state.filterCategory = '';
      categoryFilter && (categoryFilter.value = '');
    } else if (type === 'search') {
      APP.state.search = '';
      searchInput && (searchInput.value = '');
      searchClear && searchClear.classList.add('hidden');
    }
    saveFilters();
    renderProducts();
    renderActiveFilterChips();
  });
  renderActiveFilterChips();
}

export function bindProductEvents() {
  initFilterControls();
  bulkBar = document.getElementById('bulk-actions');
  bulkCount = document.getElementById('bulk-count');
  bulkButtons = [
    document.getElementById('delete-selected'),
    document.getElementById('move-shopping'),
    document.getElementById('mark-main'),
  ];
  document.addEventListener('change', (e) => {
    if (e.target.matches('input.product-select')) {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedProducts.add(id);
      else selectedProducts.delete(id);
      updateBulkActions();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.qty-inc')) adjustRow(e.target.closest('tr'), 1);
    if (e.target.closest('.qty-dec')) adjustRow(e.target.closest('tr'), -1);
  });
  document
    .querySelectorAll('#product-table thead th[data-sort-by]')
    .forEach((th) => {
      th.addEventListener('click', async () => {
        const field = th.dataset.sortBy;
        if (productPager.sort_by === field) {
          productPager.order = productPager.order === 'asc' ? 'desc' : 'asc';
        } else {
          productPager.sort_by = field;
          productPager.order = 'asc';
        }
        state.productSortField = productPager.sort_by;
        state.productSortDir = productPager.order;
        updateSortIcons();
        await loadProducts();
      });
    });
  updateSortIcons();
}

// --- expand/collapse state
// Track expand/collapse state and persist to localStorage
// Track expand/collapse state for storages and categories
// storageState: storageKey -> boolean (true = expanded)
// categoryState: storageKey -> Map(categoryKey -> boolean)
const storageState = new Map();
const categoryState = new Map();

function setHidden(el, flag) {
  if (!el) return;
  if (flag) el.classList.add("hidden");
  else el.classList.remove("hidden");
}

// ensure default: everything expanded on first render
function initExpandDefaults(container) {
  container.querySelectorAll(".storage-section").forEach((sec) => {
    const storage = sec.dataset.storage;
    if (!storageState.has(storage)) {
      const stored = localStorage.getItem(`products:storage:${storage}`);
      storageState.set(storage, stored !== "false");
    }

    if (!categoryState.has(storage)) categoryState.set(storage, new Map());
    const cMap = categoryState.get(storage);
    sec.querySelectorAll(".category-section").forEach((cat) => {
      const catKey = cat.dataset.category;
      if (!cMap.has(catKey)) {
        const cStored = localStorage.getItem(
          `products:category:${storage}::${catKey}`,
        );
        cMap.set(catKey, cStored !== "false");
      }
    });
  });
  syncAllToggles(container);
}

function syncAllToggles(container) {
  container.querySelectorAll(".storage-section").forEach((sec) => {
    const storage = sec.dataset.storage;
    const open = storageState.get(storage) !== false;
    setStorageUI(sec, open);
  });
}

function setStorageUI(storageSection, open) {
  const btn = storageSection.querySelector(".toggle-storage");
  btn.setAttribute("aria-expanded", String(open));
  const label = open ? t("collapse") : t("expand");
  btn.title = label;
  btn.setAttribute("aria-label", label);
  const icon = btn.querySelector("i");
  icon.classList.add("transition-transform");
  icon.classList.toggle("rotate-180", open);
  icon.classList.toggle("fa-caret-up", open);
  icon.classList.toggle("fa-caret-down", !open);

  const content = storageSection.querySelector(".storage-content");
  setHidden(content, !open);
  if (open && content) {
    const storage = storageSection.dataset.storage;
    const cMap = categoryState.get(storage) || new Map();
    content.querySelectorAll(".category-section").forEach((cat) => {
      const catKey = cat.dataset.category;
      const catOpen = cMap.get(catKey) !== false;
      setCategoryUI(cat, catOpen);
    });
  }
}

function setCategoryUI(categorySection, open) {
  const btn = categorySection.querySelector(".toggle-category");
  btn.setAttribute("aria-expanded", String(open));
  const label = open ? t("collapse") : t("expand");
  btn.title = label;
  btn.setAttribute("aria-label", label);
  const icon = btn.querySelector("i");
  icon.classList.add("transition-transform");
  icon.classList.toggle("rotate-180", open);
  icon.classList.toggle("fa-caret-up", open);
  icon.classList.toggle("fa-caret-down", !open);
  const body = categorySection.querySelector(".category-body");
  setHidden(body, !open);
}
function highlightRow(tr, p) {
  tr.classList.remove(
    "text-warning",
    "text-error",
    "bg-warning/10",
    "bg-error/10",
    "opacity-60",
    "font-semibold",
  );
  tr.classList.add(
    "transition-colors",
    "cursor-pointer",
    "hover:bg-neutral-100",
    "dark:hover:bg-neutral-800",
    "active:bg-neutral-200",
    "dark:active:bg-neutral-900",
  );
  const level = getStockState(p);
  if (p.main) {
    if (level === "zero")
      tr.classList.add("text-error", "bg-error/10", "font-semibold");
    else if (level === "low") tr.classList.add("text-warning", "bg-warning/10");
  } else {
    if (level === "zero")
      tr.classList.add("text-error", "bg-error/10", "opacity-60");
    else if (level === "low")
      tr.classList.add("text-warning", "bg-warning/10", "opacity-60");
  }
}

function adjustRow(tr, delta) {
  const input = tr.querySelector(".qty-input");
  if (!input) return;
  const val = Number(input.value || 0);
  const next = Math.max(0, val + delta);
  input.value = next;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildQtyCell(p, tr) {
  const td = document.createElement("td");
  td.className = "qty-cell col-span-2 flex items-center";
  td.style.minWidth = "10rem";
  if (isSpice(p)) {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-2";
    ["none", "low", "medium", "high"].forEach((l) => {
      const label = document.createElement("label");
      label.className = "cursor-pointer flex items-center gap-1";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `level-${p.name}`;
      input.value = l;
      if (p.level === l) input.checked = true;
      input.addEventListener("change", () => {
        p.level = l;
        highlightRow(tr, p);
      });
      const span = document.createElement("span");
      span.dataset.i18n = `level.${l}`;
      span.textContent = t(`level.${l}`);
      label.appendChild(input);
      label.appendChild(span);
      wrap.appendChild(label);
    });
    td.appendChild(wrap);
    return td;
  }
  const wrap = document.createElement("div");
  wrap.className = "flex items-center gap-2";
  wrap.style.minWidth = "10rem";
  const dec = document.createElement("button");
  dec.type = "button";
  dec.className = "btn-qty qty-dec";
  dec.textContent = "−";
  dec.setAttribute("aria-label", t("decrease_quantity"));
  dec.setAttribute("title", t("decrease_quantity"));
  const input = document.createElement("input");
  input.className = "qty-input no-spinner";
  input.type = "number";
  input.step = "1";
  input.inputMode = "numeric";
  input.min = "0";
  input.value = p.quantity;
  input.addEventListener(
    "input",
    debounce(() => {
      if (input.value !== "" && parseFloat(input.value) < 0) input.value = "0";
    }, 150),
  );
  input.addEventListener("change", () => {
    const val = Math.max(0, parseFloat(input.value) || 0);
    p.quantity = val;
    input.value = val;
    highlightRow(tr, p);
  });
  const inc = document.createElement("button");
  inc.type = "button";
  inc.className = "btn-qty qty-inc";
  inc.textContent = "+";
  inc.setAttribute("aria-label", t("increase_quantity"));
  inc.setAttribute("title", t("increase_quantity"));
  wrap.append(dec, input, inc);
  td.appendChild(wrap);
  return td;
}

function renderProductPager() {
  let pager = document.getElementById("product-pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "product-pager";
    pager.className = "flex justify-end gap-2 my-4";
    const table = document.getElementById("product-table");
    table?.parentElement?.appendChild(pager);
  }
  pager.innerHTML = "";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "btn btn-sm";
  prev.textContent = t("prev");
  prev.disabled = productPager.page <= 1;
  prev.addEventListener("click", () => {
    productPager.page -= 1;
    refreshProducts();
  });
  const next = document.createElement("button");
  next.type = "button";
  next.className = "btn btn-sm";
  next.textContent = t("next");
  const maxPage = Math.ceil(productPager.total / productPager.page_size);
  next.disabled = productPager.page >= maxPage;
  next.addEventListener("click", () => {
    productPager.page += 1;
    refreshProducts();
  });
  pager.append(prev, next);
}

function showNoDataRow(message) {
  const table = document.getElementById("product-table");
  const tbody = table?.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const tr = document.createElement("tr");
  const colSpan = table.querySelectorAll("thead th").length || 1;
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.className = "text-center";
  td.textContent = message;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

export async function loadProducts() {
  try {
    const params = new URLSearchParams({
      page: productPager.page,
      page_size: productPager.page_size,
      sort_by: productPager.sort_by,
      order: productPager.order,
    });
    const response = await fetch(`/api/products?${params.toString()}`);
    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("Invalid product data", data);
      showNoDataRow("Błąd danych / Invalid data");
      APP.state.products = [];
      productPager.total = 0;
      return [];
    }

    if (data.length === 0) {
      showNoDataRow("Brak produktów / No products available");
      APP.state.products = [];
      productPager.total = 0;
      return [];
    }

    productPager.page = 1;
    productPager.page_size = data.length;
    productPager.total = data.length;
    APP.state.products = data.map(normalizeProduct);
    renderProducts();
    renderProductPager();
    return APP.state.products;
  } catch (err) {
    console.error("Error loading products", err);
    showNoDataRow("Błąd podczas ładowania produktów / Error loading products");
    APP.state.products = [];
    productPager.total = 0;
    return [];
  }
}

export async function refreshProducts() {
  return loadProducts();
}

export async function saveProduct(payload) {
  try {
    await fetchJson("/api/products", {
      method: "POST",
      body: payload,
    });
    await refreshProducts();
    toast.success(t("save_success"), "", {
      label: t("toast_go_products"),
      onClick: () => {
        const hash = "#products";
        if (location.hash === hash) {
          window.activateTab("tab-products");
        } else {
          location.hash = hash;
        }
      },
    });
  } catch (err) {
    toast.error(t("notify_error_title"), err.message);
  }
}

function createFlatRow(p, idx, editable) {
  const tr = document.createElement("tr");
  tr.dataset.index = idx;
  tr.dataset.productId = p.id != null ? p.id : idx;
  if (editable) {
    tr.className = "grid grid-cols-12 items-center gap-2";
    // checkbox
    const cbTd = document.createElement("td");
    cbTd.className = "checkbox-cell col-span-1 flex items-center justify-center";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox checkbox-sm product-select";
    cb.dataset.id = p.id;
    if (selectedProducts.has(p.id)) cb.checked = true;
    cbTd.appendChild(cb);
    tr.appendChild(cbTd);
    // name
    const nameTd = document.createElement("td");
    nameTd.className = "name-cell col-span-3 flex items-center truncate";
    nameTd.textContent = t(p.id, "products");
    if (!getProduct(p.id)) nameTd.classList.add("opacity-60");
    tr.appendChild(nameTd);
    // quantity with steppers
    const qtyTd = buildQtyCell(p, tr);
    tr.appendChild(qtyTd);
    // unit select
    const unitTd = document.createElement("td");
    unitTd.className = "unit-cell col-span-1";
    if (isSpice(p)) {
      unitTd.textContent = "";
    } else {
      const unitSel = document.createElement("select");
      unitSel.className = "select select-bordered w-full";
      Object.keys(state.units).forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = t(u, "units");
        if (u === p.unit) opt.selected = true;
        unitSel.appendChild(opt);
      });
      unitTd.appendChild(unitSel);
    }
    tr.appendChild(unitTd);
    // category select
    const catTd = document.createElement("td");
    catTd.className = "category-cell col-span-2";
    const catSel = document.createElement("select");
    catSel.className = "select select-bordered w-full";
    Object.keys(state.domain.categories).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = t(c, "categories");
      if (c === (p.category || "")) opt.selected = true;
      catSel.appendChild(opt);
    });
    catTd.appendChild(catSel);
    tr.appendChild(catTd);
    // storage select
    const storTd = document.createElement("td");
    storTd.className = "storage-cell col-span-2";
    const storSel = document.createElement("select");
    storSel.className = "select select-bordered w-full";
    Object.keys(STORAGE_KEYS).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = t(STORAGE_KEYS[s] || s);
      if (s === (p.storage || "pantry")) opt.selected = true;
      storSel.appendChild(opt);
    });
    storTd.appendChild(storSel);
    tr.appendChild(storTd);
    // status
    const statusTd = document.createElement("td");
    statusTd.className = "status-cell col-span-1 text-center flex items-center justify-center";
    const status = getStatusIcon(p);
    if (status) {
      statusTd.innerHTML = status.html;
      statusTd.title = status.title;
    }
    tr.appendChild(statusTd);
  } else {
    const nameTd = document.createElement("td");
    nameTd.textContent = t(p.id, "products");
    if (!getProduct(p.id)) nameTd.classList.add("opacity-60");
    tr.appendChild(nameTd);
    const qtyTd = document.createElement("td");
    qtyTd.textContent = formatPackQuantity(p);
    tr.appendChild(qtyTd);
    const unitTd = document.createElement("td");
    unitTd.textContent = isSpice(p) ? "" : t(p.unit, "units");
    tr.appendChild(unitTd);
    const catTd = document.createElement("td");
    catTd.className = "hidden md:table-cell";
    catTd.textContent = t(p.category, "categories");
    if (!state.domain.categories[p.category]) catTd.classList.add("opacity-60");
    tr.appendChild(catTd);
    const storTd = document.createElement("td");
    storTd.className = "hidden md:table-cell";
    storTd.textContent = t(STORAGE_KEYS[p.storage] || p.storage);
    tr.appendChild(storTd);
    const statusTd = document.createElement("td");
    statusTd.className = "text-center hidden md:table-cell";
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

function renderProductsImmediate() {
  populateCategories();
  const {
    view = "flat",
    editing = false,
    search = "",
    filterStatus = '',
    filterStorage = '',
    filterCategory = '',
  } = APP.state || {};
  const products = APP.state?.products;

  const table = document.getElementById("product-table");
  const list = document.getElementById("products-by-category");
  if (!table || !list) return;
  const tbody = table.querySelector("tbody");
  list.innerHTML = "";

  function renderFallback(message) {
    table.style.display = "";
    list.style.display = "none";
    table.classList.toggle("edit-mode", editing);
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = editing ? 7 : 6;
    td.className = "text-center";
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
    updateBulkActions();
  }

  if (products == null) {
    renderFallback("Błąd podczas ładowania danych");
    return;
  }
  if (Array.isArray(products) && products.length === 0) {
    renderFallback("Brak produktów");
    return;
  }

  const domainList = Object.values(state.domain.products || {});
  const data = domainList.map((dp) => {
    const existing = products.find((p) => p.id === dp.id) || {};
    const merged = normalizeProduct({
      ...dp,
      ...existing,
      id: dp.id,
      name: t(dp.id, "products"),
    });
    return {
      ...merged,
      unitLabel: t(merged.unit, "units"),
      categoryLabel: t(merged.category, "categories"),
      storageLabel: t(STORAGE_KEYS[merged.storage] || merged.storage),
      status: getStockState(merged),
    };
  });
  APP.state.products = data;

  const term = (search || "").toLowerCase();
  const filtered = data.filter(
    (p) =>
      matchesFilter(p, {
        status: filterStatus,
        storage: filterStorage,
        category: filterCategory,
      }) &&
      (!term ||
        t(p.id, "products").toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)),
  );
  renderActiveFilterChips();

  const sortField = state.productSortField || 'name';
  const dir = state.productSortDir === 'desc' ? -1 : 1;
  const statusOrder = { zero: 0, low: 1, ok: 2 };
  filtered.sort((a, b) => {
    let va;
    let vb;
    if (sortField === 'category') {
      va = a.categoryLabel;
      vb = b.categoryLabel;
    } else if (sortField === 'storage') {
      va = a.storageLabel;
      vb = b.storageLabel;
    } else if (sortField === 'status') {
      va = statusOrder[a.status] ?? 0;
      vb = statusOrder[b.status] ?? 0;
    } else {
      va = a.name;
      vb = b.name;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  dlog("renderProducts", filtered.length);

  if (view === "flat") {
    table.style.display = "";
    list.style.display = "none";
    table.classList.toggle("edit-mode", editing);
    if (data.length === 0) {
      renderFallback("Brak produktów");
      return;
    }
    if (flatCacheEditing !== editing) {
      flatRowCache.clear();
      flatCacheEditing = editing;
    }
    if (filtered.length) {
      const rows = [];
      filtered.forEach((p, idx) => {
        let tr = flatRowCache.get(p.id);
        if (!tr) {
          tr = createFlatRow(p, idx, editing);
        }
        tr.dataset.index = idx;
        highlightRow(tr, p);
        rows.push(tr);
      });
      flatRowCache.clear();
      filtered.forEach((p, idx) => flatRowCache.set(p.id, rows[idx]));
      tbody.replaceChildren(...rows);
    } else {
      tbody.innerHTML = "";
    }
  } else {
    table.style.display = "none";
    list.style.display = "";
    tbody.innerHTML = "";
    flatRowCache.clear();
    flatCacheEditing = editing;
    if (data.length === 0) {
      const empty = document.createElement("div");
        empty.className = "p-4 text-center text-base-content/70";
        empty.textContent = t("products_empty");
        list.appendChild(empty);
        updateBulkActions();
        return;
      }
      if (!filtered.length) {
        updateBulkActions();
        return;
      }
      const storages = {};
      Object.keys(STORAGE_KEYS).forEach((s) => {
        storages[s] = {};
      });
      filtered.forEach((p) => {
        const s = p.storage || "pantry";
        const c = p.category || "uncategorized";
        storages[s][c] = storages[s][c] || [];
        storages[s][c].push(p);
      });
      Object.keys(STORAGE_KEYS)
        .sort((a, b) =>
          t(STORAGE_KEYS[a] || a).localeCompare(t(STORAGE_KEYS[b] || b)),
        )
        .forEach((stor) => {
          const block = document.createElement("section");
          block.className =
            "storage-section storage-block border border-base-300 rounded-lg p-4 space-y-4";
          block.dataset.storage = stor;

          const header = document.createElement("header");
          header.className = "storage-header flex items-center gap-2";
          const nameSpan = document.createElement("span");
          nameSpan.className = "inline-flex items-center text-xl font-semibold";
          nameSpan.textContent = `${STORAGE_ICONS[stor] || ""} ${t(STORAGE_KEYS[stor] || stor)}`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "toggle-storage ml-auto h-8 w-8 flex items-center justify-center";
          btn.setAttribute("aria-expanded", "true");
          btn.setAttribute("title", t("collapse"));
          btn.setAttribute("aria-label", t("collapse"));
          btn.innerHTML =
            '<i class="fa-regular fa-caret-up transition-transform rotate-180"></i>';
          header.append(nameSpan, btn);
          block.appendChild(header);

          const content = document.createElement("div");
          content.className = "storage-content space-y-4 pt-4";
          const categories = storages[stor];
          if (!Object.keys(categories).length) {
            const emptyMsg = document.createElement("div");
            emptyMsg.className = "p-2 text-center text-base-content/70";
            emptyMsg.textContent = t("products_empty");
            content.appendChild(emptyMsg);
          } else {
            Object.keys(categories)
              .sort(
                (a, b) =>
                  (CATEGORY_ORDER[a] || 0) - (CATEGORY_ORDER[b] || 0) ||
                  t(a, "categories").localeCompare(t(b, "categories")),
              )
              .forEach((cat) => {
                const catBlock = document.createElement("div");
                catBlock.className = "category-section category-block";
                catBlock.dataset.storage = stor;
                catBlock.dataset.category = cat;

                const catHeader = document.createElement("header");
                catHeader.className = "category-header flex items-center gap-2";
                const catSpan = document.createElement("span");
                catSpan.className = "font-medium";
                catSpan.textContent = t(cat, "categories");
                if (!state.domain.categories[cat])
                  catSpan.classList.add("opacity-60");
                const catBtn = document.createElement("button");
                catBtn.type = "button";
                catBtn.className =
                  "toggle-category ml-auto h-8 w-8 flex items-center justify-center";
                catBtn.setAttribute("aria-expanded", "true");
                catBtn.setAttribute("title", t("collapse"));
                catBtn.setAttribute("aria-label", t("collapse"));
                catBtn.innerHTML =
                  '<i class="fa-regular fa-caret-up transition-transform rotate-180"></i>';
                catHeader.append(catSpan, catBtn);
                catBlock.appendChild(catHeader);

                const body = document.createElement("div");
                body.className = "category-body pt-4";
                const table = document.createElement("table");
                table.className = "table table-zebra w-full grouped-table";
                const colgroup = document.createElement("colgroup");
                const cols = editing
                  ? [
                      "grouped-col-select",
                      "grouped-col-name",
                      "grouped-col-qty",
                      "grouped-col-unit",
                      "grouped-col-status",
                    ]
                  : [
                      "grouped-col-name",
                      "grouped-col-qty",
                      "grouped-col-unit",
                      "grouped-col-status",
                    ];
                cols.forEach((cls) => {
                  const col = document.createElement("col");
                  col.className = cls;
                  colgroup.appendChild(col);
                });
                table.appendChild(colgroup);
                const thead = document.createElement("thead");
                const hr = document.createElement("tr");
                const headers = editing
                  ? [
                      "",
                      t("table_header_name"),
                      t("table_header_quantity"),
                      t("table_header_unit"),
                      t("table_header_status"),
                    ]
                  : [
                      t("table_header_name"),
                      t("table_header_quantity"),
                      t("table_header_unit"),
                      t("table_header_status"),
                    ];
                headers.forEach((txt, i) => {
                  const th = document.createElement("th");
                  th.textContent = txt;
                  if (editing && i === 0) th.className = "checkbox-cell";
                  hr.appendChild(th);
                });
                thead.appendChild(hr);
                table.appendChild(thead);
                const tb = document.createElement("tbody");
                categories[cat].forEach((p) => {
                  const tr = document.createElement("tr");
                  const idx = data.indexOf(p);
                  tr.dataset.index = idx;
                  tr.dataset.productId = p.id != null ? p.id : idx;
                  if (editing) {
                    const cbTd = document.createElement("td");
                    cbTd.className = "checkbox-cell";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.className = "checkbox checkbox-sm product-select";
                    cb.dataset.id = p.id;
                    if (selectedProducts.has(p.id)) cb.checked = true;
                    cbTd.appendChild(cb);
                    tr.appendChild(cbTd);
                    const n = document.createElement("td");
                    n.textContent = t(p.id, "products");
                    if (!getProduct(p.id)) n.classList.add("opacity-60");
                    tr.appendChild(n);
                    const q = buildQtyCell(p, tr);
                    tr.appendChild(q);
                    const u = document.createElement("td");
                    u.textContent = t(p.unit, "units");
                    tr.appendChild(u);
                    const s = document.createElement("td");
                    const ic = getStatusIcon(p);
                    if (ic) {
                      s.innerHTML = ic.html;
                      s.title = ic.title;
                    }
                    tr.appendChild(s);
                  } else {
                    const n = document.createElement("td");
                    n.textContent = t(p.id, "products");
                    if (!getProduct(p.id)) n.classList.add("opacity-60");
                    const q = document.createElement("td");
                    q.textContent = formatPackQuantity(p);
                    const u = document.createElement("td");
                    u.textContent = t(p.unit, "units");
                    const s = document.createElement("td");
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
                content.appendChild(catBlock);
              });
          }
          block.appendChild(content);
          list.appendChild(block);
        });
      initExpandDefaults(list);
      attachCollapses(list);
    }
    updateBulkActions();
    const summaryIds = data.slice(0, 3).map((p) => p.id);
    if (DEBUG) console.debug("renderProducts", data.length, summaryIds);
    updateSortIcons();
    registerButtonEvents();
}

function registerButtonEvents() {
  const root = document;
  if (root._productBtnHandler)
    root.removeEventListener("click", root._productBtnHandler);

  const handler = async (e) => {
    const editBtn = e.target.closest(".btn-edit");
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.dataset.id;
      document.dispatchEvent(
        new CustomEvent("product:edit", { detail: { id } }),
      );
      return;
    }

    const delBtn = e.target.closest(".btn-delete");
    if (delBtn) {
      e.preventDefault();
      const id = delBtn.dataset.id;
      const question =
        t("delete_item_question") || `${t("delete") || "Delete"}?`;
      if (!window.confirm(question)) return;
      try {
        await fetchJson(`/api/products/${id}`, { method: "DELETE" });
        await refreshProducts();
      } catch (err) {
        toast.error(t("notify_error_title"), err.message);
      }
      return;
    }

    const detailsBtn = e.target.closest(".btn-details");
    if (detailsBtn) {
      e.preventDefault();
      const id = detailsBtn.dataset.id;
      document.dispatchEvent(
        new CustomEvent("product:details", { detail: { id } }),
      );
      return;
    }

    const favBtn = e.target.closest(".btn-favorite");
    if (favBtn) {
      e.preventDefault();
      const id = favBtn.dataset.id;
      try {
        await toggleFavorite(id);
        favBtn.classList.toggle("is-favorite");
      } catch (err) {
        toast.error(t("notify_error_title"), err.message);
      }
    }
  };

  root.addEventListener("click", handler);
  root._productBtnHandler = handler;
}

const scheduleRender = debounceFrame(renderProductsImmediate, 200);

export function renderProducts() {
  if (!state.domainLoaded) {
    document.addEventListener("domain:ready", () => renderProducts(), {
      once: true,
    });
    return;
  }
  scheduleRender();
}

function attachCollapses(root) {
  if (!root) return;
  if (root._toggleHandler)
    root.removeEventListener("click", root._toggleHandler);

  const toggleHandler = (e) => {
    if (APP.state && APP.state.editing) return;
    const btn = e.target.closest(".toggle-storage, .toggle-category");
    if (!btn) return;

    e.stopPropagation();

    if (btn.classList.contains("toggle-storage")) {
      const section = btn.closest(".storage-section");
      const id = section.dataset.storage;
      const next = !(storageState.get(id) !== false);
      storageState.set(id, next);
      localStorage.setItem(`products:storage:${id}`, String(next));
      setStorageUI(section, next);
    } else if (btn.classList.contains("toggle-category")) {
      const section = btn.closest(".category-section");
      const storage = section.dataset.storage;
      const cat = section.dataset.category;
      if (!categoryState.has(storage)) categoryState.set(storage, new Map());
      const cMap = categoryState.get(storage);
      const next = !(cMap.get(cat) !== false);
      cMap.set(cat, next);
      localStorage.setItem(
        `products:category:${storage}::${cat}`,
        String(next),
      );
      const parentOpen = storageState.get(storage) !== false;
      setCategoryUI(section, parentOpen && next);
    }
  };

  root.addEventListener("click", toggleHandler);
  root._toggleHandler = toggleHandler;
}

const groupedRoot = document.getElementById("products-by-category");
if (groupedRoot) {
  initExpandDefaults(groupedRoot);
  attachCollapses(groupedRoot);
}

// Wait for domain data before initial render to avoid race conditions.
if (window.__domain) {
  renderProducts();
} else {
  document.addEventListener(
    "domain:ready",
    () => {
      renderProducts();
    },
    { once: true },
  );
}

// Automatically load product data once the DOM is ready. This ensures that
// the table is populated on initial page load without requiring any user
// interaction. The listener is registered with `{ once: true }` so the fetch
// occurs exactly one time.
if (document.readyState === "loading") {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      refreshProducts();
    },
    { once: true },
  );
} else {
  // DOM has already loaded, so we can refresh immediately.
  refreshProducts();
}
