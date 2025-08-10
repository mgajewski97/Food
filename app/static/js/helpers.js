// FIX: Render & responsive boot (2025-08-09)
// CHANGELOG:
// - Added normalization helpers and spice detector.
// - Single translation helper with English fallback.

import { showTopBanner } from './components/toast.js';
export { showTopBanner };

export const CATEGORY_ORDER = { spices: 999 };

export const STORAGE_KEYS = {
  fridge: 'storage_fridge',
  pantry: 'storage_pantry',
  freezer: 'storage_freezer'
};

export const STORAGE_ICONS = {
  fridge: '🧊',
  pantry: '🏠',
  freezer: '❄️'
};

export const DEBUG = false;
export function dlog(...args) {
  if (DEBUG) console.warn(...args);
}

let storedShopping = [];
try {
  storedShopping = JSON.parse(localStorage.getItem('shoppingList') || '[]');
} catch (_) {
  storedShopping = [];
}
let storedFavs = [];
try {
  storedFavs = JSON.parse(localStorage.getItem('favoriteRecipes') || '[]');
} catch (_) {
  storedFavs = [];
}

export const state = {
  displayMode: document.documentElement.getAttribute('data-layout') || 'desktop',
  expandedStorages: {},
  expandedCategories: {},
  shoppingList: storedShopping,
  dismissedSuggestions: new Set(),
  pendingRemoveIndex: null,
  recipesData: [],
  recipesLoaded: false,
  recipesLoadQueued: false,
  recipesLoading: false,
  recipeSortField: 'name',
  recipeSortDir: 'asc',
  recipeTimeFilter: '',
  recipePortionsFilter: '',
  showFavoritesOnly: false,
  favoriteRecipes: new Set(storedFavs),
  currentLang: localStorage.getItem('lang') || 'pl',
  uiTranslations: { pl: {}, en: {} },
  domain: { products: {}, categories: {}, units: {}, aliases: {} },
  units: {},
  lowStockToastShown: false
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

export function t(key) {
  if (!key) return key;
  return state.uiTranslations[state.currentLang]?.[key] ?? state.uiTranslations.en?.[key] ?? key;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const txt = t(key);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder !== undefined) el.placeholder = txt;
    } else {
      el.textContent = txt;
    }
  });
}

export function parseTimeToMinutes(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
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
  if (mins < 30) return 'lt30';
  if (mins <= 60) return '30-60';
  return 'gt60';
}

export async function fetchJSON(url, options = {}) {
  const opts = {
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    ...options
  };
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    /* ignore parse error */
  }
  if (!res.ok) {
    const snippet = text.slice(0, 100);
    const baseMsg = (data && data.error) || snippet || `HTTP ${res.status}`;
    const trace = data && data.traceId;
    const err = new Error(
      trace ? `${baseMsg} [${t('ID')}: ${trace}]` : baseMsg
    );
    err.status = res.status;
    err.body = snippet;
    if (trace) err.traceId = trace;
    throw err;
  }
  return data;
}

export const fetchJson = fetchJSON;

export function formatPackQuantity(p) {
  if (isSpice(p)) {
    return t(`level.${p.level || 'none'}`);
  }
  if (p.pack_size) {
    const total = Math.ceil(p.quantity / p.pack_size) * p.pack_size;
    return `${p.quantity} z ${total}`;
  }
  return p.quantity;
}

export function getStatusIcon(p) {
  const level = stockLevel(p);
  if (level === 'none') {
    return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: t('status_missing') };
  }
  if (level === 'low') {
    return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-500"></i>', title: t('status_low') };
  }
  return null;
}

export async function loadTranslations() {
  window.trace?.('loadTranslations:enter');
  try {
    const [plRes, enRes] = await Promise.all([
      fetch('/api/ui/pl'),
      fetch('/api/ui/en')
    ]);
    if (!plRes.ok || !enRes.ok) throw new Error('translation load failed');
    let pl = {};
    let en = {};
    try {
      pl = await plRes.json();
    } catch (_) {
      pl = {};
    }
    try {
      en = await enRes.json();
    } catch (_) {
      en = {};
    }
    state.uiTranslations.pl = pl;
    state.uiTranslations.en = en;
    window.trace?.('loadTranslations:ok');
  } catch (err) {
    console.error('Failed to load translations', err);
    showTopBanner('Failed to load translations', {
      actionLabel: t('retry'),
      onAction: loadTranslations
    });
    throw err;
  }
}

export async function loadDomain() {
  window.trace?.('loadDomain:enter');
  try {
    const data = await fetchJson('/api/domain');
    state.domain = { products: {}, categories: {}, units: {}, aliases: {} };
    (data.products || []).forEach(p => {
      state.domain.products[p.id] = p;
      (p.aliases || []).forEach(a => {
        state.domain.aliases[a] = p.id;
      });
    });
    (data.categories || []).forEach(c => {
      const key = c.id.replace('category.', '').replace(/-/g, '_');
      state.domain.categories[key] = c;
    });
    (data.units || []).forEach(u => {
      const key = u.id.replace('unit.', '');
      state.domain.units[key] = u;
      state.units[key] = u.names;
    });
    window.trace?.('loadDomain:ok');
  } catch (err) {
    console.error('Failed to load domain', err);
    state.domain = { products: {}, categories: {}, units: {}, aliases: {} };
    showTopBanner('Failed to load domain', {
      actionLabel: t('retry'),
      onAction: loadDomain
    });
    throw err;
  }
}

function resolveProduct(id) {
  return state.domain.products[id] || state.domain.products[state.domain.aliases[id]] || null;
}

export function getProduct(id) {
  return resolveProduct(id);
}

export function productName(id) {
  if (!id) {
    console.warn('Missing product id');
    return t('unknown');
  }
  const p = resolveProduct(id);
  if (!p) {
    console.warn('Unknown product', id);
    return t('unknown');
  }
  return p.names[state.currentLang] ?? p.names.en ?? t('unknown');
}

export function categoryName(id) {
  const c = state.domain.categories[id];
  if (!c) {
    console.warn('Unknown category', id);
    return t('unknown');
  }
  return c.names[state.currentLang] ?? c.names.en ?? t('unknown');
}

export function unitName(id) {
  const u = state.domain.units[id];
  if (!u) {
    console.warn('Unknown unit', id);
    return t('unknown');
  }
  return u.names[state.currentLang] ?? u.names.en ?? t('unknown');
}

export async function searchProducts(query) {
  if (!query) return [];
  try {
    const locale = state.currentLang || 'pl';
    const res = await fetchJson(`/api/search?q=${encodeURIComponent(query)}&locale=${locale}`);
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.error('searchProducts failed', err);
    return [];
  }
}

export async function loadFavorites() {
  window.trace?.('loadFavorites:enter');
  try {
    const data = await fetchJson('/api/favorites');
    state.favoriteRecipes = new Set(data);
    localStorage.setItem('favoriteRecipes', JSON.stringify(Array.from(state.favoriteRecipes)));
    window.trace?.('loadFavorites:ok');
  } catch (err) {
    let localFavs = [];
    try {
      localFavs = JSON.parse(localStorage.getItem('favoriteRecipes') || '[]');
    } catch (_) {
      localFavs = [];
    }
    state.favoriteRecipes = new Set(localFavs);
    showTopBanner('Failed to load favorites', {
      actionLabel: t('retry'),
      onAction: loadFavorites
    });
    throw err;
  }
}

export async function toggleFavorite(name) {
  if (!name) throw new Error('invalid name');
  const had = state.favoriteRecipes.has(name);
  if (had) {
    state.favoriteRecipes.delete(name);
  } else {
    state.favoriteRecipes.add(name);
  }
  const arr = Array.from(state.favoriteRecipes);
  localStorage.setItem('favoriteRecipes', JSON.stringify(arr));
  try {
    await fetchJson('/api/favorites', {
      method: 'PUT',
      body: arr
    });
  } catch (err) {
    // revert change on failure
    if (had) state.favoriteRecipes.add(name);
    else state.favoriteRecipes.delete(name);
    localStorage.setItem('favoriteRecipes', JSON.stringify(Array.from(state.favoriteRecipes)));
    throw err;
  }
}

// Normalize product object ensuring required fields and defaults.
export function normalizeProduct(p = {}) {
  const isSp = p.is_spice === true || p.category === 'spices';
  let qty = Number(p.quantity) || 0;
  let level = p.level;
  if (isSp) {
    if (!level) {
      if (qty <= 0) level = 'none';
      else if (qty === 1) level = 'low';
      else level = 'medium';
    }
    qty = 0;
  }
  return {
    name: p.name || '',
    unit: p.unit || 'szt',
    quantity: qty,
    package_size: Number(p.package_size) || 1,
    pack_size: p.pack_size != null ? Number(p.pack_size) : null,
    threshold: p.threshold != null ? Number(p.threshold) : 1,
    main: isSp ? true : p.main !== false,
    category: isSp ? 'spices' : p.category || 'uncategorized',
    storage: p.storage || 'pantry',
    is_spice: isSp,
    level: level || (isSp ? 'none' : null)
  };
}

// Normalize recipe object and ensure ingredients are objects.
export function normalizeRecipe(r = {}) {
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map(ing => {
        if (typeof ing === 'string') return { product: ing };
        return {
          product: ing.product || '',
          quantity: ing.quantity != null ? Number(ing.quantity) : undefined,
          unit: ing.unit || undefined
        };
      })
    : [];
  return { ...r, ingredients };
}

export function isSpice(p = {}) {
  return p.category === 'spices' || p.is_spice === true;
}

export function stockLevel(p = {}) {
  if (isSpice(p)) {
    const lvl = String(p.level || '').toLowerCase();
    if (lvl === 'brak' || lvl === 'none') return 'none';
    if (lvl === 'malo' || lvl === 'low') return 'low';
    return 'ok';
  }
  if (p.quantity === 0) return 'none';
  if (p.threshold != null && p.quantity <= p.threshold) return 'low';
  return 'ok';
}

export function matchesFilter(p = {}, filter = 'all') {
  const level = stockLevel(p);
  switch (filter) {
    case 'available':
      return level === 'ok';
    case 'low':
      return level === 'low';
    case 'missing':
      return level === 'none';
    default:
      if (!p.main && p.quantity === 0) return false;
      return true;
  }
}
