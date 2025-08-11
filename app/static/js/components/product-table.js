import {
  t,
  state,
  formatPackQuantity,
  getStatusIcon,
  STORAGE_ICONS,
  CATEGORY_ORDER,
  STORAGE_KEYS,
  matchesFilter,
  stockLevel,
  normalizeProduct,
  fetchJson,
  isSpice,
  debounce,
  dlog,
  labelProduct,
  labelCategory,
  labelUnit,
  getProduct,
  DEBUG,
} from "../helpers.js";
import { toast } from "./toast.js";

const APP = (window.APP = window.APP || {});

// --- delete selected handling (button state only; actual deletion handled in script.js)
let deleteBtn;

function updateDeleteButton() {
  const selected = document.querySelectorAll(
    "input.product-select:checked",
  ).length;
  if (deleteBtn) {
    deleteBtn.disabled = selected === 0;
    deleteBtn.textContent =
      selected > 0
        ? `${t("delete_selected_button")} (${selected})`
        : t("delete_selected_button");
  }
}

export function bindProductEvents() {
  deleteBtn = document.getElementById("delete-selected");
  document.addEventListener("change", (e) => {
    if (e.target.matches("input.product-select")) updateDeleteButton();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".qty-inc")) adjustRow(e.target.closest("tr"), 1);
    if (e.target.closest(".qty-dec")) adjustRow(e.target.closest("tr"), -1);
  });
}

// --- expand/collapse state
// Track expand/collapse state and persist to localStorage
const expandedStorages = new Map(); // storageId -> true/false
const expandedCategories = new Map(); // storageId::categoryId -> true/false

function setHidden(el, flag) {
  if (!el) return;
  if (flag) el.classList.add("hidden");
  else el.classList.remove("hidden");
}

// ensure default: everything expanded on first render
function initExpandDefaults(container) {
  container.querySelectorAll(".storage-section").forEach((sec) => {
    const storage = sec.dataset.storage;
    if (!expandedStorages.has(storage)) {
      const stored = localStorage.getItem(`products:storage:${storage}`);
      expandedStorages.set(storage, stored !== "false");
    }
    sec.querySelectorAll(".category-section").forEach((cat) => {
      const key = `${storage}::${cat.dataset.category}`;
      if (!expandedCategories.has(key)) {
        const cStored = localStorage.getItem(`products:category:${key}`);
        expandedCategories.set(key, cStored !== "false");
      }
    });
  });
  syncAllToggles(container);
}

function syncAllToggles(container) {
  container.querySelectorAll(".storage-section").forEach((sec) => {
    const storage = sec.dataset.storage;
    const storageOpen = expandedStorages.get(storage) !== false;
    setStorageUI(sec, storageOpen);
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
    content.querySelectorAll(".category-section").forEach((cat) => {
      const key = `${storageSection.dataset.storage}::${cat.dataset.category}`;
      const catOpen = expandedCategories.get(key) !== false;
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
  const level = stockLevel(p);
  if (p.main) {
    if (level === "none")
      tr.classList.add("text-error", "bg-error/10", "font-semibold");
    else if (level === "low") tr.classList.add("text-warning", "bg-warning/10");
  } else {
    if (level === "none")
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
  td.className = "qty-cell";
  td.style.minWidth = "10rem";
  if (isSpice(p)) {
    const wrap = document.createElement("div");
    wrap.className = "flex gap-2";
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
  wrap.className = "qty-wrap";
  wrap.style.minWidth = "10rem";
  const dec = document.createElement("button");
  dec.type = "button";
  dec.className = "btn-qty qty-dec";
  dec.textContent = "−";
  dec.setAttribute("aria-label", t("decrease_quantity"));
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
  wrap.append(dec, input, inc);
  td.appendChild(wrap);
  return td;
}

export async function refreshProducts() {
  try {
    const data = await fetchJson("/api/products");
    APP.state.products = Array.isArray(data) ? data.map(normalizeProduct) : [];
    renderProducts();
  } catch (err) {
    toast.error(t("notify_error_title"), err.message);
  }
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
  if (editable) {
    // checkbox
    const cbTd = document.createElement("td");
    cbTd.className = "checkbox-cell";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox checkbox-sm product-select";
    cb.dataset.name = p.name;
    cbTd.appendChild(cb);
    tr.appendChild(cbTd);
    // name
    const nameTd = document.createElement("td");
    nameTd.className = "name-cell";
    nameTd.textContent = labelProduct(p.id, state.currentLang);
    if (!getProduct(p.id)) nameTd.classList.add("opacity-60");
    tr.appendChild(nameTd);
    // quantity with steppers
    const qtyTd = buildQtyCell(p, tr);
    tr.appendChild(qtyTd);
    // unit select
    const unitTd = document.createElement("td");
    unitTd.className = "unit-cell";
    if (isSpice(p)) {
      unitTd.textContent = "";
    } else {
      const unitSel = document.createElement("select");
      unitSel.className = "select select-bordered w-full";
      Object.keys(state.units).forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = labelUnit(u, state.currentLang);
        if (u === p.unit) opt.selected = true;
        unitSel.appendChild(opt);
      });
      unitTd.appendChild(unitSel);
    }
    tr.appendChild(unitTd);
    // category select
    const catTd = document.createElement("td");
    catTd.className = "category-cell";
    const catSel = document.createElement("select");
    catSel.className = "select select-bordered w-full";
    Object.keys(state.domain.categories).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = labelCategory(c, state.currentLang);
      if (c === (p.category || "")) opt.selected = true;
      catSel.appendChild(opt);
    });
    catTd.appendChild(catSel);
    tr.appendChild(catTd);
    // storage select
    const storTd = document.createElement("td");
    storTd.className = "storage-cell";
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
    statusTd.className = "status-cell text-center";
    const status = getStatusIcon(p);
    if (status) {
      statusTd.innerHTML = status.html;
      statusTd.title = status.title;
    }
    tr.appendChild(statusTd);
  } else {
    const nameTd = document.createElement("td");
    nameTd.textContent = labelProduct(p.id, state.currentLang);
    if (!getProduct(p.id)) nameTd.classList.add("opacity-60");
    tr.appendChild(nameTd);
    const qtyTd = document.createElement("td");
    qtyTd.textContent = formatPackQuantity(p);
    tr.appendChild(qtyTd);
    const unitTd = document.createElement("td");
    unitTd.textContent = isSpice(p) ? "" : labelUnit(p.unit, state.currentLang);
    tr.appendChild(unitTd);
    const catTd = document.createElement("td");
    catTd.textContent = labelCategory(p.category, state.currentLang);
    if (!state.domain.categories[p.category]) catTd.classList.add("opacity-60");
    tr.appendChild(catTd);
    const storTd = document.createElement("td");
    storTd.textContent = t(STORAGE_KEYS[p.storage] || p.storage);
    tr.appendChild(storTd);
    const statusTd = document.createElement("td");
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
  if (!state.domainLoaded) {
    document.addEventListener("domain:ready", () => renderProducts(), {
      once: true,
    });
    return;
  }
  const {
    products = [],
    view = "flat",
    filter = "all",
    editing = false,
    search = "",
  } = APP.state || {};

  const domainList = Object.values(state.domain.products || {});
  const data = domainList.map((dp) => {
    const existing = products.find((p) => p.id === dp.id) || {};
    const merged = normalizeProduct({
      ...dp,
      ...existing,
      id: dp.id,
      name: labelProduct(dp.id, state.currentLang),
    });
    return {
      ...merged,
      unitLabel: labelUnit(merged.unit, state.currentLang),
      categoryLabel: labelCategory(merged.category, state.currentLang),
      storageLabel: t(STORAGE_KEYS[merged.storage] || merged.storage),
      status: stockLevel(merged),
    };
  });
  APP.state.products = data;

  const term = (search || "").toLowerCase();
  const filtered = data.filter(
    (p) =>
      matchesFilter(p, filter) &&
      (!term ||
        labelProduct(p.id, state.currentLang).toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)),
  );

  dlog("renderProducts", filtered.length);

  const table = document.getElementById("product-table");
  const list = document.getElementById("products-by-category");
  if (!table || !list) return;
  requestAnimationFrame(() => {
    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";
    list.innerHTML = "";

    if (view === "flat") {
      table.style.display = "";
      list.style.display = "none";
      table.classList.toggle("edit-mode", editing);
      if (data.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = editing ? 7 : 6;
        td.className = "text-center";
        td.textContent = t("products_empty");
        tr.appendChild(td);
        tbody.appendChild(tr);
        updateDeleteButton();
        return;
      }
      if (filtered.length) {
        filtered.forEach((p, idx) => {
          const tr = createFlatRow(p, idx, editing);
          tbody.appendChild(tr);
        });
      }
    } else {
      table.style.display = "none";
      list.style.display = "";
      if (data.length === 0) {
        const empty = document.createElement("div");
        empty.className = "p-4 text-center text-base-content/70";
        empty.textContent = t("products_empty");
        list.appendChild(empty);
        updateDeleteButton();
        return;
      }
      if (!filtered.length) {
        updateDeleteButton();
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
            "storage-section storage-block border border-base-300 rounded-lg p-4 mb-4";
          block.dataset.storage = stor;

          const header = document.createElement("header");
          header.className = "storage-header flex items-center gap-2";
          if (state.displayMode === "mobile")
            header.classList.add("cursor-pointer");
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
          content.className = "storage-content";
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
                  labelCategory(a, state.currentLang).localeCompare(
                    labelCategory(b, state.currentLang),
                  ),
              )
              .forEach((cat) => {
                const catBlock = document.createElement("div");
                catBlock.className = "category-section category-block";
                catBlock.dataset.storage = stor;
                catBlock.dataset.category = cat;

                const catHeader = document.createElement("header");
                catHeader.className = "category-header flex items-center gap-2";
                if (state.displayMode === "mobile")
                  catHeader.classList.add("cursor-pointer");
                const catSpan = document.createElement("span");
                catSpan.className = "font-medium";
                catSpan.textContent = labelCategory(cat, state.currentLang);
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
                body.className = "category-body";
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
                    cb.dataset.name = p.name;
                    cbTd.appendChild(cb);
                    tr.appendChild(cbTd);
                    const n = document.createElement("td");
                    n.textContent = labelProduct(p.id, state.currentLang);
                    if (!getProduct(p.id)) n.classList.add("opacity-60");
                    tr.appendChild(n);
                    const q = buildQtyCell(p, tr);
                    tr.appendChild(q);
                    const u = document.createElement("td");
                    u.textContent = labelUnit(p.unit, state.currentLang);
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
                    n.textContent = labelProduct(p.id, state.currentLang);
                    if (!getProduct(p.id)) n.classList.add("opacity-60");
                    const q = document.createElement("td");
                    q.textContent = formatPackQuantity(p);
                    const u = document.createElement("td");
                    u.textContent = labelUnit(p.unit, state.currentLang);
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
    updateDeleteButton();
    const summaryIds = data.slice(0, 3).map((p) => p.id);
    if (DEBUG) console.debug("renderProducts", data.length, summaryIds);
  });
}

function attachCollapses(root) {
  if (!root) return;
  if (root._collapseHandler)
    root.removeEventListener("click", root._collapseHandler);
  if (root._headerHandler)
    root.removeEventListener("click", root._headerHandler);

  const collapseHandler = (e) => {
    if (APP.state && APP.state.editing) return;
    const storageBtn = e.target.closest(".toggle-storage");
    const catBtn = e.target.closest(".toggle-category");

    if (storageBtn) {
      e.stopPropagation();
      const section = storageBtn.closest(".storage-section");
      const id = section.dataset.storage;
      const next = !expandedStorages.get(id);
      expandedStorages.set(id, next);
      localStorage.setItem(`products:storage:${id}`, String(next));
      setStorageUI(section, next);
    }

    if (catBtn) {
      e.stopPropagation();
      const section = catBtn.closest(".category-section");
      const storage = section.dataset.storage;
      const cat = section.dataset.category;
      const key = `${storage}::${cat}`;
      const next = !expandedCategories.get(key);
      expandedCategories.set(key, next);
      localStorage.setItem(`products:category:${key}`, String(next));
      const parentOpen = expandedStorages.get(storage) !== false;
      setCategoryUI(section, parentOpen && next);
    }
  };

  const headerHandler = (e) => {
    if (APP.state && APP.state.editing) return;
    const hdr = e.target.closest(".category-header, .storage-header");
    if (!hdr) return;
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    const btn = hdr.querySelector(".toggle-category, .toggle-storage");
    if (btn) {
      e.stopPropagation();
      btn.click();
    }
  };

  root.addEventListener("click", collapseHandler);
  root.addEventListener("click", headerHandler);
  root._collapseHandler = collapseHandler;
  root._headerHandler = headerHandler;
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
