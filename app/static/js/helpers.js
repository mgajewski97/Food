// CHANGELOG:
// - Added normalization helpers and spice detector.
// - Single translation helper with English fallback.

export const CATEGORY_KEYS = {
  uncategorized: 'category_uncategorized',
  fresh_veg: 'category_fresh_veg',
  mushrooms: 'category_mushrooms',
  dairy_eggs: 'category_dairy_eggs',
  opened_preserves: 'category_opened_preserves',
  ready_sauces: 'category_ready_sauces',
  dry_veg: 'category_dry_veg',
  bread: 'category_bread',
  pasta: 'category_pasta',
  rice: 'category_rice',
  grains: 'category_grains',
  dried_legumes: 'category_dried_legumes',
  sauces: 'category_sauces',
  oils: 'category_oils',
  spreads: 'category_spreads',
  spices: 'category_spices',
  frozen_veg: 'category_frozen_veg',
  frozen_sauces: 'category_frozen_sauces',
  frozen_meals: 'category_frozen_meals'
};

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

export const state = {
  displayMode: document.documentElement.getAttribute('data-layout') || 'desktop',
  expandedStorages: {},
  expandedCategories: {},
  shoppingList: JSON.parse(localStorage.getItem('shoppingList') || '[]'),
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
  favoriteRecipes: new Set(JSON.parse(localStorage.getItem('favoriteRecipes') || '[]')),
  currentLang: localStorage.getItem('lang') || 'pl',
  translations: { products: {} },
  uiTranslations: { pl: {}, en: {} },
  units: {},
  lowStockToastShown: false
};

export function t(key) {
  if (!key) return key;
  if (key.startsWith('product.')) {
    const k = key.slice('product.'.length);
    const entry = state.translations.products[k];
    return entry?.[state.currentLang] ?? entry?.en ?? key;
  }
  const unit = state.units[key];
  if (unit) {
    return unit[state.currentLang] ?? unit.en ?? key;
  }
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

export async function fetchJson(url, options = {}) {
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
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      /* ignore parse error */
    }
    if (!res.ok) {
      const err = { url, status: res.status, body: data ?? text };
      console.error('[fetchJson]', err);
      throw err;
    }
    return data;
  } catch (err) {
    console.error('[fetchJson]', err);
    throw err;
  }
}

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
  try {
    const [plRes, enRes] = await Promise.all([
      fetch('/static/translations/pl.json'),
      fetch('/static/translations/en.json')
    ]);
    const pl = await plRes.json();
    const en = await enRes.json();
    state.uiTranslations.pl = pl;
    state.uiTranslations.en = en;
    state.translations.products = {};
    const keys = new Set([...Object.keys(pl), ...Object.keys(en)]);
    keys.forEach(k => {
      if (k.startsWith('product.')) {
        const id = k.slice('product.'.length);
        state.translations.products[id] = {};
        if (pl[k]) state.translations.products[id].pl = pl[k];
        if (en[k]) state.translations.products[id].en = en[k];
      }
    });
  } catch (err) {
    console.error('Failed to load translations', err);
  }
}

export async function loadUnits() {
  try {
    state.units = await fetchJson('/api/units');
  } catch (err) {
    console.error('Failed to load units', err);
    state.units = {};
  }
}

export async function loadFavorites() {
  try {
    const data = await fetchJson('/api/favorites');
    state.favoriteRecipes = new Set(data);
    localStorage.setItem('favoriteRecipes', JSON.stringify(Array.from(state.favoriteRecipes)));
  } catch (err) {
    state.favoriteRecipes = new Set(JSON.parse(localStorage.getItem('favoriteRecipes') || '[]'));
  }
}

export function toggleFavorite(name) {
  if (state.favoriteRecipes.has(name)) {
    state.favoriteRecipes.delete(name);
  } else {
  state.favoriteRecipes.add(name);
  }
  const arr = Array.from(state.favoriteRecipes);
  localStorage.setItem('favoriteRecipes', JSON.stringify(arr));
  fetchJson('/api/favorites', {
    method: 'PUT',
    body: arr
  }).catch(() => {});
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
    return p.level || 'none';
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
      return true;
  }
}
