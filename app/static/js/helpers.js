// CHANGELOG:
// - Added normalization helpers and spice detector.
// - Guaranteed translation fallback returns key when missing.

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
  frozen_veg: 'category_frozen_veg',
  frozen_sauces: 'category_frozen_sauces',
  frozen_meals: 'category_frozen_meals'
};

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
    return (entry && entry[state.currentLang]) || key;
  }
  const unit = state.units[key];
  if (unit && unit[state.currentLang]) return unit[state.currentLang];
  return state.uiTranslations[state.currentLang][key] || key;
}

export function productName(key) {
  const translated = t(key);
  return translated === key ? key.replace(/^product\./, '') : translated;
}

export function unitName(key) {
  const translated = t(key);
  return translated === key ? key : translated;
}

export function categoryName(key) {
  const tKey = CATEGORY_KEYS[key] || key;
  const translated = t(tKey);
  return translated === tKey ? key : translated;
}

export function storageName(key) {
  const tKey = STORAGE_KEYS[key] || key;
  const translated = t(tKey);
  return translated === tKey ? key : translated;
}

export function parseTimeToMinutes(str) {
  if (!str) return null;
  let minutes = 0;
  const h = str.match(/(\d+)\s*h/);
  if (h) minutes += parseInt(h[1], 10) * 60;
  const m = str.match(/(\d+)\s*min/);
  if (m) minutes += parseInt(m[1], 10);
  return minutes;
}

export function timeToBucket(str) {
  const mins = parseTimeToMinutes(str);
  if (mins == null) return null;
  if (mins < 30) return 'lt30';
  if (mins <= 60) return '30-60';
  return 'gt60';
}

export function formatPackQuantity(p) {
  if (p.pack_size) {
    const total = Math.ceil(p.quantity / p.pack_size) * p.pack_size;
    return `${p.quantity} z ${total}`;
  }
  return p.quantity;
}

export function getStatusIcon(p) {
  if (p.main) {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: t('status_missing') };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-500"></i>', title: t('status_low') };
    }
  } else {
    if (p.quantity === 0) {
      return { html: '<i class="fa-regular fa-circle-exclamation text-red-600"></i>', title: t('status_missing') };
    }
    if (p.threshold !== null && p.quantity <= p.threshold) {
      return { html: '<i class="fa-regular fa-triangle-exclamation text-yellow-300"></i>', title: t('status_low') };
    }
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
    Object.entries(pl).forEach(([k, v]) => {
      if (k.startsWith('product.')) {
        const key = k.slice('product.'.length);
        state.translations.products[key] = { pl: v };
        if (en[k]) state.translations.products[key].en = en[k];
      }
    });
  } catch (err) {
    console.error('Failed to load translations', err);
  }
}

export async function loadUnits() {
  try {
    const res = await fetch('/api/units');
    state.units = await res.json();
  } catch (err) {
    console.error('Failed to load units', err);
    state.units = {};
  }
}

export async function loadFavorites() {
  try {
    const res = await fetch('/api/favorites');
    const data = await res.json();
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
  fetch('/api/favorites', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arr)
  }).catch(() => {});
}

// Normalize product object ensuring required fields and defaults.
export function normalizeProduct(p = {}) {
  return {
    name: p.name || '',
    unit: p.unit || 'szt',
    quantity: Number(p.quantity) || 0,
    package_size: Number(p.package_size) || 1,
    pack_size: p.pack_size != null ? Number(p.pack_size) : null,
    threshold: p.threshold != null ? Number(p.threshold) : 1,
    main: p.main !== false,
    category: p.category || 'uncategorized',
    storage: p.storage || 'pantry',
    is_spice: p.is_spice === true || p.category === 'spices',
    level: p.level || null
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
  if (p.quantity === 0 && p.main) return 'none';
  if (p.main && p.threshold != null && p.quantity <= p.threshold) return 'low';
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
