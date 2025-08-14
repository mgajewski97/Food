import {
  t,
  state,
  isSpice,
  getStockState,
  fetchJson,
  getProductCategory,
  saveShoppingCollapsed,
  CATEGORY_ORDER,
} from "../helpers.js";
import { toast } from "./toast.js";

function saveShoppingList() {
  localStorage.setItem("shoppingList", JSON.stringify(state.shoppingList));
}

function updateSummary() {
  const total = state.shoppingList.length;
  const purchased = state.shoppingList.filter((i) => i.inCart).length;
  const totalEl = document.getElementById("shopping-total");
  const purchasedEl = document.getElementById("shopping-purchased");
  const clearBtn = document.getElementById("clear-purchased");
  if (totalEl) totalEl.textContent = total;
  if (purchasedEl) purchasedEl.textContent = purchased;
  if (clearBtn) clearBtn.disabled = purchased === 0;
}

export function addToShoppingList(name, quantity = 1) {
  if (!name) {
    toast.error(t("notify_error_title"));
    return;
  }
  quantity = Math.max(1, parseFloat(quantity) || 1);
  const existing = state.shoppingList.find((item) => item.name === name);
  if (existing) {
    existing.quantity += quantity;
  } else {
    const item = { name, quantity, inCart: false };
    state.shoppingList.push(item);
  }
  saveShoppingList();
  renderShoppingList();
  toast.success(t("manual_add_success"), "", {
    label: t("toast_go_shopping"),
    onClick: () => {
      const hash = "#shopping";
      if (location.hash === hash) {
        window.activateTab("tab-shopping");
      } else {
        location.hash = hash;
      }
      renderSuggestions();
      renderShoppingList();
    },
  });
}
function sortShoppingList() {
  state.shoppingList.sort((a, b) => {
    if (a.inCart && b.inCart) return (a.cartTime || 0) - (b.cartTime || 0);
    if (a.inCart !== b.inCart) return a.inCart ? 1 : -1;
    return t(a.name, "products").localeCompare(t(b.name, "products"));
  });
}

function renderShoppingItem(item, idx) {
  const row = document.createElement("div");
  row.className =
    "shopping-item gap-2 h-11 hover:bg-base-200 transition-colors";
  row.dataset.name = item.name;
  row.tabIndex = 0;
  if (item.inCart) row.classList.add("in-cart");

  const stock = (window.APP?.state?.products || []).find(
    (p) => p.name === item.name,
  );
  if (stock) {
    const level = getStockState(stock);
    if (level === "low") row.classList.add("product-low");
    if (level === "zero") row.classList.add("product-missing");
  }

  const nameWrap = document.createElement("div");
  nameWrap.className = "flex items-center gap-1 overflow-hidden";
  const nameEl = document.createElement("span");
  nameEl.className = "truncate";
  const lbl = t(item.name, "products");
  nameEl.textContent = lbl;
  nameEl.title = lbl;
  if (lbl === item.name) nameEl.classList.add("opacity-60");
  if (item.inCart) nameEl.classList.add("line-through");
  nameWrap.appendChild(nameEl);
  if (stock && stock.quantity > 0) {
    const owned = document.createElement("span");
    owned.className = "owned-info";
    owned.textContent = `(${t("owned")}: ${stock.quantity})`;
    nameWrap.appendChild(owned);
  }
  row.appendChild(nameWrap);

  const qtyWrap = document.createElement("div");
  qtyWrap.className = "flex items-center gap-2";
  const dec = document.createElement("button");
  dec.type = "button";
  dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
  dec.className = "touch-btn qty-btn";
  dec.setAttribute("aria-label", t("decrease_quantity"));
  dec.setAttribute("title", t("decrease_quantity"));
  dec.disabled = item.inCart;
  const qtyEl = document.createElement("span");
  qtyEl.className = "qty-value w-10 text-center";
  qtyEl.setAttribute("aria-live", "polite");
  qtyEl.textContent = item.quantity;
  const inc = document.createElement("button");
  inc.type = "button";
  inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
  inc.className = "touch-btn qty-btn";
  inc.setAttribute("aria-label", t("increase_quantity"));
  inc.setAttribute("title", t("increase_quantity"));
  inc.disabled = item.inCart;
  dec.addEventListener("click", () => {
    item.quantity = Math.max(1, item.quantity - 1);
    saveShoppingList();
    renderShoppingList();
  });
  inc.addEventListener("click", () => {
    item.quantity += 1;
    saveShoppingList();
    renderShoppingList();
  });
  qtyWrap.append(dec, qtyEl, inc);
  row.appendChild(qtyWrap);

  const cartBtn = document.createElement("button");
  cartBtn.type = "button";
  cartBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
  cartBtn.className = "touch-btn";
  cartBtn.style.margin = "0 auto";
  cartBtn.classList.toggle("text-primary", item.inCart);
  cartBtn.setAttribute("aria-label", t("in_cart"));
  cartBtn.setAttribute("title", t("in_cart"));
  cartBtn.setAttribute("aria-pressed", item.inCart);
  cartBtn.addEventListener("click", async () => {
    item.inCart = !item.inCart;
    if (item.inCart) {
      item.cartTime = Date.now();
    } else {
      delete item.cartTime;
    }
    if (item.inCart && stock && isSpice(stock)) {
      cartBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await fetchJson("/api/products", {
          method: "POST",
          body: { ...stock, level: "high", quantity: 0 },
        });
        stock.level = "high";
      } catch (err) {
        toast.error(t("notify_error_title"), err.message);
      }
    }
    saveShoppingList();
    renderShoppingList();
  });
  row.appendChild(cartBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "touch-btn text-error";
  delBtn.style.margin = "0 auto";
  delBtn.innerHTML = '<i class="fa-solid fa-circle-minus"></i>';
  delBtn.setAttribute("aria-label", t("delete_confirm_button"));
  delBtn.setAttribute("title", t("delete_confirm_button"));
  delBtn.addEventListener("click", () => {
    const modal = document.getElementById("shopping-delete-modal");
    const confirmBtn = document.getElementById("confirm-remove-item");
    modal.showModal();
    confirmBtn.onclick = () => {
      const idx = state.shoppingList.indexOf(item);
      if (idx > -1) state.shoppingList.splice(idx, 1);
      saveShoppingList();
      modal.close();
      confirmBtn.onclick = null;
      renderShoppingList();
    };
  });
  row.appendChild(delBtn);

  row.addEventListener("keydown", (e) => {
    if (e.target !== row) return;
    if (e.key === "Enter") {
      e.preventDefault();
      cartBtn.click();
    } else if (e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (!item.inCart) cartBtn.click();
    }
  });

  return row;
}

export function renderShoppingList() {
  const list = document.getElementById("shopping-list");
  if (!list) return;
  sortShoppingList();

  const groups = new Map();
  state.shoppingList.forEach((item, idx) => {
    const cat = getProductCategory(item.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ item, idx });
  });

  const categories = Array.from(groups.keys()).sort((a, b) => {
    const oa = CATEGORY_ORDER[a] || 0;
    const ob = CATEGORY_ORDER[b] || 0;
    if (oa !== ob) return oa - ob;
    return t(a, "categories").localeCompare(t(b, "categories"));
  });

  const frag = document.createDocumentFragment();
  categories.forEach((cat, i) => {
    const section = document.createElement("div");
    section.className = "shopping-category";
    if (i > 0) section.classList.add("border-t", "border-base-300");
    section.dataset.category = cat;

    const header = document.createElement("div");
    header.className =
      "category-header flex items-center justify-between px-2 py-1";
    const title = document.createElement("span");
    title.textContent = t(cat, "categories");
    header.appendChild(title);
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-caret-down transition-transform";
    header.appendChild(icon);
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "category-body divide-y divide-base-300";
    groups.get(cat).forEach(({ item, idx }) => {
      body.appendChild(renderShoppingItem(item, idx));
    });
    section.appendChild(body);

    const collapsed = state.shoppingCollapsed[cat];
    if (collapsed) {
      section.classList.add("collapsed");
      icon.classList.add("rotate-180");
    }
    header.addEventListener("click", () => {
      const isCollapsed = section.classList.toggle("collapsed");
      icon.classList.toggle("rotate-180", isCollapsed);
      state.shoppingCollapsed[cat] = isCollapsed;
      saveShoppingCollapsed();
    });

    frag.appendChild(section);
  });

  requestAnimationFrame(() => {
    list.innerHTML = "";
    list.appendChild(frag);
    updateSummary();
  });
}

export function renderSuggestions() {
  const container = document.getElementById("suggestion-list");
  if (!container) return;
  container.innerHTML = "";
  const products = window.APP?.state?.products || [];
  const suggestions = products
    .filter((p) => {
      if (isSpice(p)) {
        return ["low", "zero"].includes(getStockState(p));
      }
      return (
        p.main &&
        (p.quantity === 0 || (p.threshold != null && p.quantity <= p.threshold))
      );
    })
    .filter((p) => !state.dismissedSuggestions.has(p.name))
    .sort((a, b) => t(a.id, "products").localeCompare(t(b.id, "products")));
  const frag = document.createDocumentFragment();
  suggestions.forEach((p) => {
    let qty = p.threshold != null ? p.threshold : 1;
    const row = document.createElement("div");
    row.className =
      "suggestion-item gap-2 h-11 hover:bg-base-200 transition-colors";
    const level = getStockState(p);
    if (level === "low") row.classList.add("product-low");
    if (level === "zero") row.classList.add("product-missing");

    const nameWrap = document.createElement("div");
    nameWrap.className = "flex items-center gap-1 overflow-hidden";
    const nameEl = document.createElement("span");
    nameEl.className = "truncate";
    const lbl = t(p.id, "products");
    nameEl.textContent = lbl;
    nameEl.title = lbl;
    if (lbl === p.id) nameEl.classList.add("opacity-60");
    nameWrap.appendChild(nameEl);
    if (p.quantity > 0) {
      const owned = document.createElement("span");
      owned.className = "owned-info";
      owned.textContent = `(${t("owned")}: ${p.quantity})`;
      nameWrap.appendChild(owned);
    }
    row.appendChild(nameWrap);

    const qtyWrap = document.createElement("div");
    qtyWrap.className = "flex items-center gap-2";
    const dec = document.createElement("button");
    dec.type = "button";
    dec.innerHTML = '<i class="fa-solid fa-minus"></i>';
    dec.className = "touch-btn";
    dec.setAttribute("aria-label", t("decrease_quantity"));
    dec.setAttribute("title", t("decrease_quantity"));
    const qtyEl = document.createElement("span");
    qtyEl.className = "w-10 text-center";
    qtyEl.setAttribute("aria-live", "polite");
    qtyEl.textContent = qty;
    const inc = document.createElement("button");
    inc.type = "button";
    inc.innerHTML = '<i class="fa-solid fa-plus"></i>';
    inc.className = "touch-btn";
    inc.setAttribute("aria-label", t("increase_quantity"));
    inc.setAttribute("title", t("increase_quantity"));
    dec.addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      qtyEl.textContent = qty;
    });
    inc.addEventListener("click", () => {
      qty += 1;
      qtyEl.textContent = qty;
    });
    qtyWrap.append(dec, qtyEl, inc);
    row.appendChild(qtyWrap);

    const accept = document.createElement("button");
    accept.type = "button";
    accept.innerHTML = '<i class="fa-regular fa-circle-check"></i>';
    accept.className = "touch-btn text-success";
    accept.style.margin = "0 auto";
    accept.setAttribute("aria-label", t("accept_action"));
    accept.setAttribute("title", t("accept_action"));
    accept.addEventListener("click", () => {
      state.dismissedSuggestions.add(p.name);
      addToShoppingList(p.name, qty);
      row.remove();
    });
    const reject = document.createElement("button");
    reject.type = "button";
    reject.innerHTML = '<i class="fa-regular fa-circle-xmark"></i>';
    reject.className = "touch-btn text-error";
    reject.style.margin = "0 auto";
    reject.setAttribute("aria-label", t("reject_action"));
    reject.setAttribute("title", t("reject_action"));
    reject.addEventListener("click", () => {
      state.dismissedSuggestions.add(p.name);
      row.remove();
    });
    row.append(accept, reject);

    frag.appendChild(row);
  });
  requestAnimationFrame(() => {
    container.innerHTML = "";
    container.appendChild(frag);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("clear-purchased")?.addEventListener("click", () => {
    document.getElementById("shopping-clear-modal")?.showModal();
  });

  document
    .getElementById("confirm-clear-purchased")
    ?.addEventListener("click", () => {
      state.shoppingList = state.shoppingList.filter((i) => !i.inCart);
      saveShoppingList();
      renderShoppingList();
      document.getElementById("shopping-clear-modal")?.close();
    });
});
