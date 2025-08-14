import {
  t,
  state,
  timeToBucket,
  toggleFavorite,
  fetchJson,
  debounce,
  getProduct,
} from "../helpers.js";
import { toast } from "./toast.js";
import { openRecipeDetails } from "./recipe-detail.js";

state.recipePage = state.recipePage || 1;
state.recipePageSize = state.recipePageSize || 50;

export function renderRecipes() {
  const list = document.getElementById("recipe-list");
  if (!list) return;
  let data = (state.domain.recipes || []).slice();
  if (state.recipeTimeFilter)
    data = data.filter((r) => r.timeBucket === state.recipeTimeFilter);
  if (state.recipePortionsFilter) {
    if (state.recipePortionsFilter === "5+") {
      data = data.filter((r) => (r.servings || 0) >= 5);
    } else {
      data = data.filter(
        (r) => String(r.servings) === state.recipePortionsFilter,
      );
    }
  }
  if (state.showFavoritesOnly)
    data = data.filter((r) => state.favoriteRecipes.has(r.id));
  state.renderedRecipes = data;
  const frag = document.createDocumentFragment();
  if (data.length === 0) {
    const empty = document.createElement("div");
    empty.className = "p-4 text-center opacity-60";
    empty.textContent = t("recipes_empty_state");
    frag.appendChild(empty);
  } else {
    data.forEach((r) => {
      const row = document.createElement("div");
      row.className =
        "recipe-item flex items-center justify-between p-2 rounded cursor-pointer hover:bg-base-200";
      row.dataset.id = r.id;
      const nameStr = r.names?.[state.currentLang] || r.names?.en || r.id;
      const name = document.createElement("span");
      name.className = "truncate";
      name.textContent = nameStr;
      row.appendChild(name);
      const favBtn = document.createElement("button");
      favBtn.className = "btn btn-ghost btn-xs";
      favBtn.innerHTML = state.favoriteRecipes.has(r.id)
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';
      favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        favBtn.disabled = true;
        const prev = favBtn.innerHTML;
        favBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
          await toggleFavorite(r.id);
          favBtn.innerHTML = state.favoriteRecipes.has(r.id)
            ? '<i class="fa-solid fa-heart"></i>'
            : '<i class="fa-regular fa-heart"></i>';
          document.dispatchEvent(new Event("favorites-changed"));
        } catch (err) {
          favBtn.innerHTML = prev;
          toast.error(t("notify_error_title"), err.message);
        } finally {
          favBtn.disabled = false;
        }
      });
      row.appendChild(favBtn);
      row.addEventListener("click", () => openRecipeDetails(r));
      frag.appendChild(row);
    });
  }
  requestAnimationFrame(() => {
    list.innerHTML = "";
    list.appendChild(frag);
    highlightSelection();
  });
}

function highlightSelection(scroll = false) {
  const list = document.getElementById("recipe-list");
  if (!list) return;
  [...list.children].forEach((el) =>
    el.classList.toggle("bg-base-300", el.dataset.id === state.activeRecipeId),
  );
  if (scroll && state.activeRecipeId) {
    const sel = list.querySelector(
      `[data-id="${CSS.escape(state.activeRecipeId)}"]`,
    );
    sel?.scrollIntoView({ block: "nearest" });
  }
}

function renderRecipePager() {
  let pager = document.getElementById("recipe-pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "recipe-pager";
    pager.className = "flex justify-end gap-2 my-4";
    const list = document.getElementById("recipe-list");
    list?.parentElement?.appendChild(pager);
  }
  pager.innerHTML = "";
  const prev = document.createElement("button");
  prev.className = "btn btn-sm";
  prev.textContent = t("prev");
  prev.disabled = state.recipePage <= 1;
  prev.addEventListener("click", () => {
    state.recipePage -= 1;
    loadRecipes();
  });
  const next = document.createElement("button");
  next.className = "btn btn-sm";
  next.textContent = t("next");
  const maxPage = Math.ceil((state.recipesTotal || 0) / state.recipePageSize);
  next.disabled = state.recipePage >= maxPage;
  next.addEventListener("click", () => {
    state.recipePage += 1;
    loadRecipes();
  });
  pager.append(prev, next);
}

export async function loadRecipes() {
  if (state.recipesLoading) return state.domain.recipes;
  const panel = document.getElementById("tab-recipes");
  if (!state.recipesLoaded && panel && panel.style.display === "none") {
    if (!state.recipesLoadQueued) {
      const tab = document.querySelector('[data-tab-target="tab-recipes"]');
      tab?.addEventListener("click", () => loadRecipes(), { once: true });
      state.recipesLoadQueued = true;
    }
    return state.domain.recipes;
  }
  state.recipesLoading = true;
  try {
    const locale = state.currentLang || "pl";
    const params = new URLSearchParams({
      locale,
      page: String(state.recipePage),
      page_size: String(state.recipePageSize),
      sort_by: state.recipeSortField,
      order: state.recipeSortDir,
    });
    const data = await fetchJson(`/api/recipes?${params.toString()}`);
    const processed = (data.items || []).map((r) => ({
      ...r,
      timeBucket: timeToBucket(r.time),
      available: (r.ingredients || []).every((i) => getProduct(i.productId)),
    }));
    state.domain.recipes = processed;
    state.recipesData = processed;
    state.recipesLoaded = true;
    state.recipePage = data.page;
    state.recipesTotal = data.total;
    renderRecipes();
    renderRecipePager();
    if (state.activeRecipeId) {
      const cur = processed.find((r) => r.id === state.activeRecipeId);
      if (cur) openRecipeDetails(cur);
    }
    return processed;
  } catch (err) {
    toast.error(t("recipes_load_failed"), err.status || err.message, {
      label: t("retry"),
      onClick: loadRecipes,
    });
    return [];
  } finally {
    state.recipesLoading = false;
  }
}

export function bindRecipeEvents() {
  document.addEventListener("favorites-changed", () => {
    renderRecipes();
  });

  const sortField = document.getElementById("recipe-sort-field");
  const sortAsc = document.getElementById("recipe-sort-dir-asc");
  const sortDesc = document.getElementById("recipe-sort-dir-desc");
  const sortMobile = document.getElementById("recipe-sort-mobile");
  const timeFilter = document.getElementById("recipe-time-filter");
  const portionsFilter = document.getElementById("recipe-portions-filter");
  const favToggle = document.getElementById("recipe-favorites-toggle");
  const clearBtn = document.getElementById("recipe-clear-filters");

  function updateSortButtons() {
    sortAsc?.classList.toggle("btn-primary", state.recipeSortDir === "asc");
    sortAsc?.classList.toggle("btn-outline", state.recipeSortDir !== "asc");
    sortDesc?.classList.toggle("btn-primary", state.recipeSortDir === "desc");
    sortDesc?.classList.toggle("btn-outline", state.recipeSortDir !== "desc");
  }

  sortField?.addEventListener(
    "change",
    debounce(() => {
      state.recipeSortField = sortField.value;
      state.recipePage = 1;
      loadRecipes();
    }, 150),
  );
  sortAsc?.addEventListener("click", () => {
    state.recipeSortDir = "asc";
    updateSortButtons();
    state.recipePage = 1;
    loadRecipes();
  });
  sortDesc?.addEventListener("click", () => {
    state.recipeSortDir = "desc";
    updateSortButtons();
    state.recipePage = 1;
    loadRecipes();
  });
  sortMobile?.addEventListener(
    "change",
    debounce(() => {
      const [field, dir] = sortMobile.value.split("-");
      state.recipeSortField = field;
      state.recipeSortDir = dir;
      updateSortButtons();
       state.recipePage = 1;
      loadRecipes();
    }, 150),
  );

  timeFilter?.addEventListener(
    "change",
    debounce(() => {
      state.recipeTimeFilter = timeFilter.value;
      state.recipePage = 1;
      loadRecipes();
    }, 150),
  );
  portionsFilter?.addEventListener(
    "change",
    debounce(() => {
      state.recipePortionsFilter = portionsFilter.value;
      state.recipePage = 1;
      loadRecipes();
    }, 150),
  );
  favToggle?.addEventListener("click", () => {
    state.showFavoritesOnly = !state.showFavoritesOnly;
    favToggle.classList.toggle("btn-primary", state.showFavoritesOnly);
    favToggle.classList.toggle("btn-outline", !state.showFavoritesOnly);
    state.recipePage = 1;
    loadRecipes();
  });
  clearBtn?.addEventListener("click", () => {
    state.recipeSortField = "name";
    state.recipeSortDir = "asc";
    state.recipeTimeFilter = "";
    state.recipePortionsFilter = "";
    state.showFavoritesOnly = false;
    sortField && (sortField.value = "name");
    sortMobile && (sortMobile.value = "name-asc");
    timeFilter && (timeFilter.value = "");
    portionsFilter && (portionsFilter.value = "");
    favToggle?.classList.remove("btn-primary");
    favToggle?.classList.add("btn-outline");
    updateSortButtons();
    state.recipePage = 1;
    loadRecipes();
  });

  updateSortButtons();

  function moveSelection(delta) {
    const items = state.renderedRecipes || [];
    if (!items.length) return;
    let idx = items.findIndex((r) => r.id === state.activeRecipeId);
    if (idx === -1) idx = delta > 0 ? -1 : 0;
    idx = Math.min(items.length - 1, Math.max(0, idx + delta));
    state.activeRecipeId = items[idx].id;
    highlightSelection(true);
  }

  document.addEventListener("keydown", async (e) => {
    const panel = document.getElementById("tab-recipes");
    if (!panel || panel.style.display === "none") return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    const items = state.renderedRecipes || [];
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const rec = items.find((r) => r.id === state.activeRecipeId);
      if (rec) openRecipeDetails(rec);
    } else if (e.key.toLowerCase() === "f") {
      const id = state.activeRecipeId;
      if (id) {
        e.preventDefault();
        try {
          await toggleFavorite(id);
          document.dispatchEvent(new Event("favorites-changed"));
          const favIcon = document.querySelector("#recipe-detail #recipe-detail-fav");
          if (favIcon && state.activeRecipeId === id) {
            favIcon.innerHTML = state.favoriteRecipes.has(id)
              ? '<i class="fa-solid fa-heart"></i>'
              : '<i class="fa-regular fa-heart"></i>';
          }
          highlightSelection();
        } catch (err) {
          toast.error(t("notify_error_title"), err.message);
        }
      }
    }
  });
}

// Render recipe list once the domain data is ready.
if (window.__domain) {
  loadRecipes();
} else {
  document.addEventListener(
    "domain:ready",
    () => {
      loadRecipes();
    },
    { once: true },
  );
}
