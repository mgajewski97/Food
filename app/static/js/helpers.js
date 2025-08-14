/**
 * @typedef {Object} Ingredient
 * @property {string} product
 * @property {number} [quantity]
 * @property {string} [unit]
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {{pl:string, en:string}} names
 * @property {number} portions
 * @property {string} time
 * @property {Ingredient[]} ingredients
 * @property {string[]} steps
 * @property {string[]} tags
 */

/**
 * @typedef {Object} Product
 * @property {string} name
 * @property {string} unit
 * @property {number} quantity
 * @property {string} category
 * @property {string} storage
 * @property {number} threshold
 * @property {boolean} main
 * @property {number} package_size
 * @property {number|null} [pack_size]
 * @property {string|null} [level]
 * @property {boolean} is_spice
 */

import { showTopBanner } from "./components/toast.js";
export { showTopBanner };

export const CATEGORY_ORDER = { spices: 999 };

export const STORAGE_KEYS = {
  fridge: "storage_fridge",
  pantry: "storage_pantry",
  freezer: "storage_freezer",
};

export const STORAGE_ICONS = {
  fridge: "🧊",
  pantry: "🏠",
  freezer: "❄️",
};

export const DEBUG = Boolean(window.DEBUG);
export function dlog(...args) {
  if (DEBUG) console.warn(...args);
}

let storedShopping = [];
try {
  storedShopping = JSON.parse(localStorage.getItem("shoppingList") || "[]");
} catch {
  storedShopping = [];
}
let storedFavs = [];
try {
  storedFavs = JSON.parse(localStorage.getItem("favoriteRecipes") || "[]");
} catch {
  storedFavs = [];
}

export const state = {
  displayMode:
    document.documentElement.getAttribute("data-layout") || "desktop",
  expandedStorages: {},
  expandedCategories: {},
  shoppingList: storedShopping,
  dismissedSuggestions: new Set(),
  pendingRemoveIndex: null,
  recipesData: [],
  recipesLoaded: false,
  recipesLoadQueued: false,
  recipesLoading: false,
  recipeSortField: "name",
  recipeSortDir: "asc",
  recipeTimeFilter: "",
  recipePortionsFilter: "",
  showFavoritesOnly: false,
  favoriteRecipes: new Set(storedFavs),
  currentLang: localStorage.getItem("lang") || "pl",
  uiTranslations: { pl: {}, en: {} },
  domain: { products: {}, categories: {}, units: {}, aliases: {}, recipes: [] },
  units: {},
  lowStockToastShown: false,
  productSortField: "name",
  productSortDir: "asc",
};

// In-memory cache metadata for conditional requests
const httpCache = {};

// Accessible modal helper
const nativeShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function (...args) {
  if (!this.hasAttribute("role")) this.setAttribute("role", "dialog");
  const labelled = this.getAttribute("aria-labelledby");
  if (!labelled) {
    const title = this.querySelector("h1,h2,h3,h4,h5,h6");
    if (title) {
      if (!title.id) title.id = `${this.id || "dialog"}-title`;
      this.setAttribute("aria-labelledby", title.id);
    }
  }
  nativeShowModal.apply(this, args);
  const focusables = this.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const primary = this.querySelector("[data-modal-primary]") || first;
  const trap = (e) => {
    if (e.key === "Tab") {
      if (focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      primary?.click();
    }
  };
  this.addEventListener("keydown", trap);
  this.addEventListener("close", () => {
    this.removeEventListener("keydown", trap);
  }, { once: true });
  if (primary) {
    if (!primary.getAttribute("aria-label")) {
      primary.setAttribute("aria-label", primary.textContent.trim());
    }
    primary.focus();
  }
};

// Utility helpers for performance-sensitive handlers
export function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), delay);
  };
}

export function throttle(fn, delay = 200) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(null, args);
    }
  };
}

export function setFieldError(el, msg) {
  let err = el.nextElementSibling;
  if (!err || !err.classList.contains("form-error")) {
    err = document.createElement("p");
    err.className = "form-error";
    el.insertAdjacentElement("afterend", err);
  }
  err.textContent = msg || "";
  err.style.display = msg ? "block" : "none";
}

export function clearFieldError(el) {
  setFieldError(el, "");
}

export function t(key, ns = "ui") {
  if (!key) return key;
  if (ns === "products") {
    const p =
      state.domain.products[key] ||
      state.domain.products[state.domain.aliases[key]];
    if (!p) {
      warnOnce("products", key);
      return key;
    }
    const name = p.names[state.currentLang] || p.names.en;
    return name || key;
  }
  if (ns === "categories") {
    const c = state.domain.categories[key];
    if (!c) {
      warnOnce("categories", key);
      return key;
    }
    const name = c.names[state.currentLang] || c.names.en;
    return name || key;
  }
  if (ns === "units") {
    const u = state.domain.units[key];
    if (!u) {
      warnOnce("units", key);
      return key;
    }
    const name = u.names[state.currentLang] || u.names.en;
    return name || key;
  }
  const val =
    state.uiTranslations[state.currentLang]?.[key] ||
    state.uiTranslations.en?.[key];
  return val || key;
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder !== undefined) el.placeholder = txt;
    } else {
      el.textContent = txt;
    }
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    el.title = t(key);
  });
  document.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    const key = el.getAttribute("data-i18n-tip");
    el.setAttribute("data-tip", t(key));
  });
}

export function parseTimeToMinutes(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const str = String(value);
  let minutes = 0;
  const h = str.match(/(\d+)\s*h/);
  if (h) minutes += parseInt(h[1], 10) * 60;
  const m = str.match(/(\d+)\s*min/);
  if (m) minutes += parseInt(m[1], 10);
  return minutes || null;
}

export function timeToBucket(str) {
  const mins = parseTimeToMinutes(str);
  if (mins == null) return null;
  if (mins < 30) return "lt30";
  if (mins <= 60) return "30-60";
  return "gt60";
}

/**
 * Fetch JSON data with uniform error handling.
 * Displays a toast on HTTP errors unless `{silent: true}` is passed.
 * @param {string} url
 * @param {RequestInit & {silent?: boolean}} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, options = {}) {
  const cacheKey =
    url.startsWith("/api/products") || url.startsWith("/api/recipes")
      ? url
      : null;
  const meta = cacheKey ? httpCache[cacheKey] : null;
  const opts = {
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  };
  if (meta) {
    if (meta.etag) opts.headers["If-None-Match"] = meta.etag;
    if (meta.lastModified) opts.headers["If-Modified-Since"] = meta.lastModified;
  }
  if (
    opts.body &&
    typeof opts.body !== "string" &&
    !(opts.body instanceof FormData)
  ) {
    opts.body = JSON.stringify(opts.body);
    opts.headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (!opts.silent) showTopBanner(err.message || "Network error");
    throw err;
  }
  if (cacheKey) {
    const etag = res.headers.get("ETag") || meta?.etag;
    const lm = res.headers.get("Last-Modified") || meta?.lastModified;
    httpCache[cacheKey] = { etag, lastModified: lm, data: meta?.data };
  }
  if (res.status === 304 && cacheKey && httpCache[cacheKey]?.data !== undefined) {
    return httpCache[cacheKey].data;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ignore parse error */
  }
  if (cacheKey) {
    httpCache[cacheKey].data = data;
  }
  if (!res.ok) {
    const snippet = text.slice(0, 100);
    const baseMsg = (data && data.error) || snippet || `HTTP ${res.status}`;
    const trace = data && data.traceId;
    const message = trace ? `${baseMsg} [${t("ID")}: ${trace}]` : baseMsg;
    if (!opts.silent) {
      showTopBanner(message);
    }
    const err = new Error(message);
    err.status = res.status;
    err.body = snippet;
    if (trace) err.traceId = trace;
    throw err;
  }
  return data;
}

export function formatPackQuantity(p) {
  if (isSpice(p)) {
    return t(`level.${p.level || "none"}`);
  }
  if (p.pack_size) {
    const total = Math.ceil(p.quantity / p.pack_size) * p.pack_size;
    return `${p.quantity} z ${total}`;
  }
  return p.quantity;
}

export function getStatusIcon(p) {
  const level = getStockState(p);
  if (level === "zero") {
    return {
      html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>',
      title: t("status_missing"),
    };
  }
  if (level === "low") {
    return {
      html: '<i class="fa-regular fa-triangle-exclamation text-yellow-500"></i>',
      title: t("status_low"),
    };
  }
  return null;
}

export async function loadTranslations() {
  window.trace?.("loadTranslations:enter");
  try {
    const [plRes, enRes] = await Promise.all([
      fetch("/api/ui/pl"),
      fetch("/api/ui/en"),
    ]);
    if (!plRes.ok || !enRes.ok) throw new Error("translation load failed");
    let pl = {};
    let en = {};
    try {
      pl = await plRes.json();
    } catch {
      pl = {};
    }
    try {
      en = await enRes.json();
    } catch {
      en = {};
    }
    state.uiTranslations.pl = pl;
    state.uiTranslations.en = en;
    window.trace?.("loadTranslations:ok");
  } catch (err) {
    console.error("Failed to load translations", err);
    showTopBanner("Failed to load translations", {
      actionLabel: t("retry"),
      onAction: loadTranslations,
    });
    throw err;
  }
}

function validateProducts(list = []) {
  const errs = [];
  list.forEach((p, idx) => {
    ["name", "quantity", "unit", "category", "storage"].forEach((k) => {
      if (p[k] == null) errs.push(`products[${idx}].${k}`);
    });
  });
  return errs;
}

function validateRecipes(list = []) {
  const errs = [];
  list.forEach((r, idx) => {
    if (!r.id) errs.push(`recipes[${idx}].id`);
    if (!r.names || !r.names.pl || !r.names.en)
      errs.push(`recipes[${idx}].names`);
    if (typeof r.portions !== "number")
      errs.push(`recipes[${idx}].portions`);
    if (!Array.isArray(r.ingredients))
      errs.push(`recipes[${idx}].ingredients`);
    else {
      r.ingredients.forEach((ing, i) => {
        if (!ing.product)
          errs.push(`recipes[${idx}].ingredients[${i}].product`);
      });
    }
    if (!Array.isArray(r.steps)) errs.push(`recipes[${idx}].steps`);
  });
  return errs;
}

export async function loadDomain() {
  window.trace?.("loadDomain:enter");
  try {
    const data = await fetchJson("/api/domain");
    window.__domain = data;
    const domainData = data.domain || data;
    state.domain = {
      products: {},
      categories: {},
      units: {},
      aliases: {},
      recipes: [],
    };
    (domainData.products || []).forEach((p) => {
      state.domain.products[p.id] = p;
      (p.aliases || []).forEach((a) => {
        state.domain.aliases[a] = p.id;
      });
    });
    (domainData.categories || []).forEach((c) => {
      const key = c.id.replace("category.", "").replace(/-/g, "_");
      state.domain.categories[key] = c;
    });
    (domainData.units || []).forEach((u) => {
      const key = u.id.replace("unit.", "");
      state.domain.units[key] = u;
      state.units[key] = u.names;
    });
    const APP = (window.APP = window.APP || {});
    APP.state = APP.state || {};
    APP.state.products = (data.products || []).map(normalizeProduct);
    state.recipesData = (data.recipes || []).map((r) => {
      const rec = normalizeRecipe(r);
      return {
        ...rec,
        timeBucket: timeToBucket(rec.time),
        available: (rec.ingredients || []).every((i) => getProduct(i.product)),
      };
    });
    const validationErrors = [
      ...validateProducts(APP.state.products),
      ...validateRecipes(state.recipesData),
    ];
    if (validationErrors.length) {
      console.error("domain validation", validationErrors);
      throw new Error("domain validation failed");
    }
    state.recipesLoaded = true;
    state.domainLoaded = true;
    if (DEBUG)
      console.debug("domain:ready", {
        products: APP.state.products.length,
        recipes: state.recipesData.length,
      });
    document.dispatchEvent(new Event("domain:ready"));
    window.trace?.("loadDomain:ok");
  } catch (err) {
    console.error("Failed to load domain", err);
    state.domain = {
      products: {},
      categories: {},
      units: {},
      aliases: {},
      recipes: [],
    };
    showTopBanner("Failed to load domain", {
      actionLabel: t("retry"),
      onAction: loadDomain,
    });
    throw err;
  }
}

function resolveProduct(id) {
  return (
    state.domain.products[id] ||
    state.domain.products[state.domain.aliases[id]] ||
    null
  );
}

export function getProduct(id) {
  return resolveProduct(id);
}

const warnedIds = {
  products: new Set(),
  units: new Set(),
  categories: new Set(),
};

function warnOnce(type, id) {
  if (!id) return;
  const set = warnedIds[type];
  if (DEBUG && set && !set.has(id)) {
    set.add(id);
    console.warn(`Unknown ${type.slice(0, -1)} id`, id);
  }
}

export async function searchProducts(query) {
  if (!query) return [];
  try {
    const locale = state.currentLang || "pl";
    const res = await fetchJson(
      `/api/search?q=${encodeURIComponent(query)}&locale=${locale}`,
    );
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.error("searchProducts failed", err);
    return [];
  }
}

export async function loadFavorites() {
  window.trace?.("loadFavorites:enter");
  try {
    const data = await fetchJson("/api/favorites");
    state.favoriteRecipes = new Set(data);
    localStorage.setItem(
      "favoriteRecipes",
      JSON.stringify(Array.from(state.favoriteRecipes)),
    );
    window.trace?.("loadFavorites:ok");
  } catch (err) {
    let localFavs = [];
    try {
      localFavs = JSON.parse(localStorage.getItem("favoriteRecipes") || "[]");
    } catch {
      localFavs = [];
    }
    state.favoriteRecipes = new Set(localFavs);
    showTopBanner("Failed to load favorites", {
      actionLabel: t("retry"),
      onAction: loadFavorites,
    });
    throw err;
  }
}

export async function toggleFavorite(id) {
  if (!id) throw new Error("invalid id");
  const had = state.favoriteRecipes.has(id);
  if (had) {
    state.favoriteRecipes.delete(id);
  } else {
    state.favoriteRecipes.add(id);
  }
  const arr = Array.from(state.favoriteRecipes);
  localStorage.setItem("favoriteRecipes", JSON.stringify(arr));
  try {
    await fetchJson("/api/favorites", {
      method: "PUT",
      body: arr,
    });
  } catch (err) {
    // revert change on failure
    if (had) state.favoriteRecipes.add(id);
    else state.favoriteRecipes.delete(id);
    localStorage.setItem(
      "favoriteRecipes",
      JSON.stringify(Array.from(state.favoriteRecipes)),
    );
    throw err;
  }
}

// Normalize product object ensuring required fields and defaults.
export function normalizeProduct(p = {}) {
  const id = p.id || p.name || "";
  const isSp = p.is_spice === true || p.category === "spices";
  let qty = Number(p.quantity ?? p.amount);
  if (isNaN(qty) || qty < 0) qty = 0;
  let level = p.level;
  if (isSp) {
    if (!level) {
      if (qty <= 0) level = "none";
      else if (qty === 1) level = "low";
      else level = "medium";
    }
    qty = 0;
  }
  return {
    id,
    name: p.name || id,
    unit: p.unit || "szt",
    quantity: qty,
    package_size: Math.max(0, Number(p.package_size) || 1),
    pack_size: p.pack_size != null ? Math.max(0, Number(p.pack_size)) : null,
    threshold: p.threshold != null ? Math.max(0, Number(p.threshold)) : 1,
    main: isSp ? true : p.main !== false,
    category: isSp ? "spices" : p.category || "uncategorized",
    storage: p.storage || "pantry",
    is_spice: isSp,
    level: level || (isSp ? "none" : null),
  };
}

// Normalize recipe object and ensure ingredients are objects.
export function normalizeRecipe(r = {}) {
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map((ing) => {
        if (typeof ing === "string") return { product: ing };
        const qty =
          ing.quantity != null && !isNaN(Number(ing.quantity))
            ? Math.max(0, Number(ing.quantity))
            : undefined;
        return {
          product: ing.product || "",
          quantity: qty,
          unit: ing.unit || undefined,
        };
      })
    : [];
  return { ...r, ingredients };
}

export function isSpice(p = {}) {
  return p.category === "spices" || p.is_spice === true;
}

export function getStockState(p = {}) {
  if (isSpice(p)) {
    const lvl = String(p.level || "").toLowerCase();
    if (lvl === "brak" || lvl === "none" || lvl === "zero") return "zero";
    if (lvl === "malo" || lvl === "low") return "low";
    return "ok";
  }
  if (p.quantity === 0) return "zero";
  if (p.threshold != null && p.quantity <= p.threshold) return "low";
  return "ok";
}

export function matchesFilter(p = {}, filter = "all") {
  const state = getStockState(p);
  switch (filter) {
    case "available":
      return state === "ok";
    case "low":
      return state === "low";
    case "missing":
      return state === "zero";
    default:
      return true;
  }
}

// Desktop tab accessibility and toolbar handling
document.addEventListener("DOMContentLoaded", () => {
  const tablist = document.querySelector(".desktop-nav");
  if (tablist) {
    tablist.setAttribute("role", "tablist");
    const tabs = Array.from(tablist.querySelectorAll("[data-tab-target]"));
    tabs.forEach((tab) => {
      const active = tab.classList.contains("tab-active");
      tab.setAttribute("role", "tab");
      tab.setAttribute("tabindex", active ? "0" : "-1");
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    tablist.addEventListener("keydown", (e) => {
      const tabs = Array.from(tablist.querySelectorAll("[role='tab']"));
      const current = document.activeElement;
      const index = tabs.indexOf(current);
      if (index === -1) return;
      let nextIndex = index;
      switch (e.key) {
        case "ArrowRight":
          nextIndex = (index + 1) % tabs.length;
          break;
        case "ArrowLeft":
          nextIndex = (index - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        case " ":
        case "Enter":
          current.click();
          e.preventDefault();
          return;
        default:
          return;
      }
      tabs[nextIndex].focus();
      e.preventDefault();
    });
  }

  const orig = window.activateTab;
  if (typeof orig === "function") {
    window.activateTab = async (id) => {
      await orig(id);
      const tabs = document.querySelectorAll(".desktop-nav [role='tab']");
      tabs.forEach((tab) => {
        const sel = tab.dataset.tabTarget === id;
        tab.setAttribute("aria-selected", sel ? "true" : "false");
        tab.setAttribute("tabindex", sel ? "0" : "-1");
      });
      document.querySelectorAll("[data-action-tab]").forEach((btn) => {
        btn.style.display = btn.dataset.actionTab === id ? "" : "none";
      });
    };
  }

  document.getElementById("add-product-btn")?.addEventListener("click", () => {
    const editToggle = document.getElementById("edit-toggle");
    if (editToggle && editToggle.getAttribute("aria-pressed") === "false") {
      editToggle.click();
    }
    document.getElementById("add-section")?.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("edit-json-header")?.addEventListener("click", () => {
    document.getElementById("edit-json")?.scrollIntoView({ behavior: "smooth" });
  });
});
