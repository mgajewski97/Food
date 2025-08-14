import { state, t, toggleFavorite, saveLastRecipe } from "../helpers.js";
import { addToShoppingList } from "./shopping-list.js";

function renderRecipeDetail(r) {
  const title = r.names?.[state.currentLang] || r.names?.en || r.id;
  const badges = [];
  if (r.servings != null)
    badges.push(`<span class="badge badge-sm"><i class="fa-solid fa-users mr-1"></i>${r.servings}</span>`);
  if (r.time)
    badges.push(`<span class="badge badge-sm"><i class="fa-regular fa-clock mr-1"></i>${r.time}</span>`);
  (r.tags || []).forEach((tag) =>
    badges.push(`<span class="badge badge-sm">${tag}</span>`),
  );
  const badgeHtml = badges.length
    ? `<div class="flex flex-wrap gap-2 mt-1">${badges.join("")}</div>`
    : "";

  const ingRows = (r.ingredients || [])
    .map((i) => {
      const name = i.productName || t(i.productId, "products");
      const qty = (i.qty ?? "").toString();
      const unit = i.unitName || (i.unitId ? t(i.unitId, "units") : "");
      const qtyStr = [qty, unit].filter(Boolean).join(" ");
      const unknown = name === i.productId ? " opacity-60" : "";
      return `<tr><td class="pr-4${unknown}">${name}</td><td class="text-right">${qtyStr}</td></tr>`;
    })
    .join("");

  const steps = (r.steps || [])
    .map((s) => `<li class="mb-2">${s}</li>`)
    .join("");

  const favIcon = state.favoriteRecipes.has(r.id)
    ? '<i class="fa-solid fa-heart"></i>'
    : '<i class="fa-regular fa-heart"></i>';

  return `
    <div class="flex justify-between items-start mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-bold flex-1">${title}</h3>
          <button id="recipe-detail-fav" class="btn btn-ghost btn-sm" type="button" aria-label="${t("checkbox_favorite_label")}" title="${t("checkbox_favorite_label")}">${favIcon}</button>
        </div>
        ${badgeHtml}
      </div>
      <button id="recipe-detail-add" class="btn btn-primary btn-sm" type="button" data-i18n="recipe_add_to_shopping">${t("recipe_add_to_shopping")}</button>
    </div>
    <section class="mb-4">
      <h4 class="font-semibold mb-2">${t("recipe_ingredients_header")}</h4>
      <table class="table w-full"><tbody>${ingRows}</tbody></table>
    </section>
    <section>
      <h4 class="font-semibold mb-2">${t("recipe_steps_header")}</h4>
      <ol class="list-decimal pl-6 space-y-2">${steps}</ol>
    </section>`;
}

export function openRecipeDetails(r) {
  const panel = document.getElementById("recipe-detail");
  if (!panel) return;
  panel.innerHTML = renderRecipeDetail(r);
  saveLastRecipe(r.id);

  const favBtn = panel.querySelector("#recipe-detail-fav");
  favBtn?.addEventListener("click", async () => {
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
      console.error(err);
      favBtn.innerHTML = prev;
    } finally {
      favBtn.disabled = false;
    }
  });

  const addBtn = panel.querySelector("#recipe-detail-add");
  addBtn?.addEventListener("click", () => {
    (r.ingredients || []).forEach((ing) => {
      const name = ing.productId || ing.productName;
      const qty = ing.qty || 1;
      addToShoppingList(name, qty);
    });
  });

  // highlight selected list item
  const list = document.getElementById("recipe-list");
  if (list) {
    [...list.children].forEach((el) =>
      el.classList.toggle(
        "bg-base-300",
        el.dataset.id === r.id,
      ),
    );
    const sel = list.querySelector(`[data-id="${CSS.escape(r.id)}"]`);
    sel?.scrollIntoView({ block: "nearest" });
  }
}
