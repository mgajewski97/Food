import json
import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# FIX: 2024-05-06

from flask import Blueprint, current_app, render_template, request, jsonify
from .utils.logging import log_error_with_trace

from .utils import (
    load_json,
    load_json_validated,
    normalize_product,
    normalize_recipe,
    safe_write,
    validate_file,
    validate_items,
    file_lock,
    save_json,
)

"""Flask application providing basic CRUD APIs for a pantry manager."""

# CHANGELOG:
# - Moved JSON schemas to ``app/schemas`` and wired validation through utils.
# - Hardened API handlers with fail-soft data loading and ingredient normalization.
# - Added validation summary endpoint returning counts and warnings.

logger = logging.getLogger(__name__)
bp = Blueprint("routes", __name__)

BASE_DIR = os.path.dirname(__file__)
SCHEMA_DIR = os.path.join(BASE_DIR, "schemas")
DATA_DIR = os.path.join(BASE_DIR, "data")
PRODUCTS_PATH = os.path.join(DATA_DIR, "products.json")
RECIPES_PATH = os.path.join(DATA_DIR, "recipes.json")
PRODUCTS_SCHEMA = os.path.join(SCHEMA_DIR, "product.schema.json")
RECIPES_SCHEMA = os.path.join(SCHEMA_DIR, "recipe.schema.json")
UNITS_PATH = os.path.join(DATA_DIR, "units.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
FAVORITES_PATH = os.path.join(DATA_DIR, "favorites.json")
SHOPPING_PATH = os.path.join(DATA_DIR, "shopping_list.json")

UNIT_CONVERSIONS = {
    ("unit.g", "unit.kg"): 0.001,
    ("unit.kg", "unit.g"): 1000,
    ("unit.ml", "unit.l"): 0.001,
    ("unit.l", "unit.ml"): 1000,
}

UNIT_ID_TO_NAME = {
    "unit.g": "g",
    "unit.kg": "kg",
    "unit.ml": "ml",
    "unit.l": "l",
    "unit.szt": "szt",
}
UNIT_NAME_TO_ID = {v: k for k, v in UNIT_ID_TO_NAME.items()}


def _convert_qty(qty: float, from_unit: str, to_unit: str) -> Optional[float]:
    if from_unit == to_unit:
        return qty
    factor = UNIT_CONVERSIONS.get((from_unit, to_unit))
    if factor is None:
        return None
    return qty * factor


def _to_base(qty: float, unit: str) -> Tuple[float, str]:
    base_map = {"unit.kg": "unit.g", "unit.l": "unit.ml"}
    base = base_map.get(unit, unit)
    converted = _convert_qty(qty, unit, base)
    if converted is None:
        return qty, unit
    return converted, base


def run_initial_validation() -> None:
    """Validate core datasets once on application startup."""
    for _path, _schema, _norm in [
        (PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize_product),
        (RECIPES_PATH, RECIPES_SCHEMA, normalize_recipe),
    ]:
        validate_file(_path, [], _schema, _norm)


def _load_products_compat():
    """Return legacy product list built from normalized domain data."""
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise ValueError(str(exc))

    categories = {c.get("id"): c for c in data.get("categories", [])}
    units = {u.get("id"): u for u in data.get("units", [])}
    legacy = []

    for prod in data.get("products", []):
        cat = categories.get(prod.get("categoryId"))
        unit = units.get(prod.get("unitId"))
        if not cat:
            logger.warning(
                "product %s references missing category %s",
                prod.get("id"),
                prod.get("categoryId"),
            )
            continue
        if not unit:
            logger.warning(
                "product %s references missing unit %s",
                prod.get("id"),
                prod.get("unitId"),
            )
            continue

        category_key = cat.get("id", "").replace("category.", "").replace("-", "_")
        unit_key = unit.get("id", "").replace("unit.", "")
        name_key = (prod.get("aliases") or [prod.get("id")])[0]

        item = {
            "id": prod.get("id"),
            "name": name_key,
            "name_pl": prod.get("names", {}).get("pl", ""),
            "name_en": prod.get("names", {}).get("en", ""),
            "category": category_key,
            "unit": unit_key,
            "quantity": 0,
            "threshold": 0,
            "storage": "pantry",
            "main": True,
            "package_size": 1,
            "pack_size": None,
            "level": None,
            "is_spice": category_key == "spices",
            "aliases": prod.get("aliases", []),
            "tags": [],
        }

        if item["is_spice"]:
            item["level"] = "none"

        legacy.append(item)

    legacy.sort(key=lambda p: p.get("name_pl", "").lower())
    return legacy


def remove_used_products(used_ingredients):
    """Remove used ingredients from stored products."""
    with file_lock(PRODUCTS_PATH):
        products = load_json_validated(
            PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
        )
        products = [p for p in products if p.get("name") not in used_ingredients]
        safe_write(PRODUCTS_PATH, products)


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/manifest.json")
def manifest():
    return current_app.send_static_file("manifest.json")


@bp.route("/service-worker.js")
def service_worker():
    return current_app.send_static_file("service-worker.js")


@bp.route("/api/ui/<string:lang>")
def ui_strings(lang):
    """Return UI translation strings for a given locale."""
    path = os.path.join(BASE_DIR, "static", "translations", f"{lang}.json")
    if not os.path.exists(path):
        return jsonify({"error": "not found"}), 404
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        logger.info(str(exc))
        return jsonify({"error": str(exc)}), 500
    return jsonify(data)


@bp.route("/api/domain")
def domain():
    """Return normalized domain data of products, categories and units."""
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        logger.info(str(exc))
        return jsonify({"error": str(exc)}), 500
    return jsonify(data)

@bp.route("/api/products", methods=["GET", "POST", "PUT"])
def products():
    context = {"endpoint": "/api/products", "args": request.args.to_dict()}
    try:
        if request.method == "GET":
            try:
                products = _load_products_compat()
            except ValueError as exc:
                logger.info(str(exc))
                return jsonify({"error": str(exc)}), 500
            return jsonify(products)

        payload = request.get_json(silent=True) or []
        if isinstance(payload, dict):
            payload = [payload]
        items = [normalize_product(p) for p in payload]
        try:
            validate_items(items, PRODUCTS_SCHEMA)
        except ValueError as exc:
            logger.info("request: %s", exc)
            return jsonify({"error": str(exc)}), 400

        with file_lock(PRODUCTS_PATH):
            try:
                products = load_json_validated(
                    PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
                )
            except ValueError as exc:
                logger.info(str(exc))
                return jsonify({"error": str(exc)}), 500
            existing = {p["name"]: p for p in products}
            for item in items:
                existing[item["name"]] = item
            products = list(existing.values())
            safe_write(PRODUCTS_PATH, products)
        return jsonify(products)
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = log_error_with_trace(exc, context)
        return (
            jsonify({"error": "Internal Server Error", "traceId": trace_id}),
            500,
        )

@bp.route("/api/products/<string:name>", methods=["DELETE"])
def delete_product(name):
    context = {"endpoint": "/api/products/<name>", "args": request.args.to_dict()}
    try:
        with file_lock(PRODUCTS_PATH):
            try:
                products = load_json_validated(
                    PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
                )
            except ValueError as exc:
                logger.info(str(exc))
                return jsonify({"error": str(exc)}), 500
            products = [p for p in products if p.get("name") != name]
            safe_write(PRODUCTS_PATH, products)
        return "", 204
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = log_error_with_trace(exc, context)
        return (
            jsonify({"error": "Internal Server Error", "traceId": trace_id}),
            500,
        )


@bp.route("/api/units", methods=["GET", "PUT"])
def units():
    if request.method == "PUT":
        units = request.json or {}
        save_json(UNITS_PATH, units)
        return jsonify(units)
    return jsonify(load_json(UNITS_PATH, {}))

@bp.route("/api/ocr-match", methods=["POST"])
def ocr_match():
    payload = request.json or {}
    items = payload.get("items", [])
    products = load_json_validated(
        PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
    )
    results = []
    for raw in items:
        text = str(raw).strip().lower()
        matches = [p for p in products if text and text in p.get("name", "").lower()]
        results.append({
            'original': raw,
            'matches': [
                {
                    'name': m.get('name'),
                    'category': m.get('category'),
                    'storage': m.get('storage')
                }
                for m in matches
            ]
        })
    return jsonify(results)

@bp.route("/api/recipes")
def recipes():
    """Return all recipes with normalized ingredient structures.

    Older iterations of the backend attempted to filter out recipes whose
    ingredients were not present in ``products.json``. This proved too strict
    and resulted in an empty recipe list whenever the pantry data was out of
    sync with the recipes file.  The front-end expects the raw recipe dataset
    and performs its own availability checks if needed, therefore we simply
    load and normalize the recipes here.
    """

    context = {"endpoint": "/api/recipes", "args": request.args.to_dict()}
    try:
        try:
            recipes = load_json_validated(
                RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe
            )
        except ValueError as exc:
            logger.info(str(exc))
            return jsonify({"error": str(exc)}), 500
        return jsonify(recipes)
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = log_error_with_trace(exc, context)
        return (
            jsonify({"error": "Internal Server Error", "traceId": trace_id}),
            500,
        )


@bp.route("/api/history", methods=["GET", "POST"])
def history():
    if request.method == "POST":
        entry = request.json or {}
        entry.setdefault("date", date.today().isoformat())
        history = load_json(HISTORY_PATH, [])
        history.append(entry)
        save_json(HISTORY_PATH, history)
        if entry.get("used_ingredients"):
            remove_used_products(entry["used_ingredients"])
        return jsonify(history)
    return jsonify(load_json(HISTORY_PATH, []))


@bp.route("/api/favorites", methods=["GET", "PUT"])
def favorites():
    """Store or retrieve favorite recipes."""
    context = {"endpoint": "/api/favorites", "args": request.args.to_dict()}
    try:
        if request.method == "PUT":
            favs = request.json or []
            save_json(FAVORITES_PATH, favs)
            return jsonify(favs)
        return jsonify(load_json(FAVORITES_PATH, []))
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = log_error_with_trace(exc, context)
        return (
            jsonify({"error": "Internal Server Error", "traceId": trace_id}),
            500,
        )
    

def _generate_shopping_list(selection: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    recipes = load_json_validated(
        RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe
    )
    recipes_map = {r.get("id"): r for r in recipes}
    aggregate: Dict[Tuple[str, str], float] = {}
    optional_map: Dict[Tuple[str, str], bool] = {}
    for sel in selection:
        rid = sel.get("id")
        servings = float(sel.get("servings", 0))
        recipe = recipes_map.get(rid)
        if not recipe:
            continue
        scale = servings / (recipe.get("portions") or 1)
        for ing in recipe.get("ingredients", []):
            pid = ing.get("productId")
            unit = ing.get("unitId")
            qty = ing.get("qty")
            if not pid or not unit or qty is None:
                continue
            qty_scaled = qty * scale
            qty_base, base_unit = _to_base(qty_scaled, unit)
            key = (pid, base_unit)
            aggregate[key] = aggregate.get(key, 0) + qty_base
            if ing.get("optional"):
                optional_map[key] = True
            else:
                optional_map.setdefault(key, False)
    try:
        products = load_json_validated(
            PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
        )
    except ValueError:
        products = []
    stock: Dict[Tuple[str, str], float] = {}
    for prod in products:
        pid = prod.get("name")
        unit_name = prod.get("unit", "")
        unit_id = UNIT_NAME_TO_ID.get(unit_name, unit_name)
        qty_base, base_unit = _to_base(prod.get("quantity", 0), unit_id)
        key = (pid, base_unit)
        stock[key] = stock.get(key, 0) + qty_base
    items: List[Dict[str, Any]] = []
    for key, total in aggregate.items():
        available = stock.get(key, 0)
        remaining = max(total - available, 0)
        if remaining <= 0:
            continue
        pid, unit = key
        items.append(
            {
                "productId": pid,
                "unitId": unit,
                "quantity_to_buy": remaining,
                "optional": optional_map.get(key, False),
                "in_cart": False,
            }
        )
    return items


@bp.route("/api/shopping", methods=["GET", "POST"])
def shopping():
    if request.method == "POST":
        payload = request.json or {}
        selection = payload.get("recipes", [])
        items = _generate_shopping_list(selection)
        save_json(SHOPPING_PATH, items)
        return jsonify(items)
    return jsonify(load_json(SHOPPING_PATH, []))


@bp.route("/api/shopping/<string:product_id>", methods=["PATCH"])
def shopping_mark(product_id: str):
    items = load_json(SHOPPING_PATH, [])
    flag = bool((request.json or {}).get("inCart"))
    updated = False
    for item in items:
        if item.get("productId") == product_id:
            item["in_cart"] = flag
            updated = True
            break
    if updated:
        save_json(SHOPPING_PATH, items)
    return jsonify(items)


def _update_pantry(items: List[Dict[str, Any]]) -> None:
    with file_lock(PRODUCTS_PATH):
        try:
            products = load_json_validated(
                PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
            )
        except ValueError:
            products = []
        prod_map = {p.get("name"): p for p in products}
        for it in items:
            pid = it.get("productId")
            qty = it.get("quantity_to_buy", 0)
            unit_id = it.get("unitId")
            unit_name = UNIT_ID_TO_NAME.get(unit_id, unit_id)
            if pid in prod_map:
                product = prod_map[pid]
                prod_unit_id = UNIT_NAME_TO_ID.get(
                    product.get("unit", unit_name), unit_name
                )
                converted = _convert_qty(qty, unit_id, prod_unit_id)
                if converted is None:
                    continue
                product["quantity"] = product.get("quantity", 0) + converted
            else:
                prod_map[pid] = {
                    "name": pid,
                    "quantity": qty,
                    "unit": unit_name,
                    "category": "uncategorized",
                    "storage": "pantry",
                    "threshold": 1,
                    "main": True,
                    "package_size": 1,
                    "pack_size": None,
                    "tags": [],
                    "level": None,
                    "is_spice": False,
                }
        save_json(
            PRODUCTS_PATH,
            list(prod_map.values()),
            PRODUCTS_SCHEMA,
            normalize_product,
        )


@bp.route("/api/shopping/confirm", methods=["POST"])
def shopping_confirm():
    items = load_json(SHOPPING_PATH, [])
    purchased = [i for i in items if i.get("in_cart")]
    if purchased:
        _update_pantry(purchased)
    remaining = [i for i in items if not i.get("in_cart")]
    save_json(SHOPPING_PATH, remaining)
    return jsonify(remaining)


@bp.route("/api/health")
def health():
    """Basic health check ensuring data files validate."""
    try:
        load_json_validated(
            PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
        )
        load_json_validated(
            RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe
        )
    except ValueError as exc:
        logger.info("health check failed: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True})


@bp.route("/api/_health")
def health_new():
    """Lightweight health check exposing dataset stats."""
    context = {"endpoint": "/api/_health", "args": request.args.to_dict()}
    try:
        products = _load_products_compat()
        recipes = load_json_validated(
            RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe
        )
        last_updated_ts = max(
            os.path.getmtime(PRODUCTS_PATH), os.path.getmtime(RECIPES_PATH)
        )
        last_updated = datetime.fromtimestamp(
            last_updated_ts, tz=timezone.utc
        ).isoformat()
        return jsonify(
            {
                "status": "ok",
                "schemaVersion": "normalized@1",
                "productsCount": len(products),
                "recipesCount": len(recipes),
                "lastUpdated": last_updated,
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = log_error_with_trace(exc, context)
        return (
            jsonify({"error": "Internal Server Error", "traceId": trace_id}),
            500,
        )


@bp.route("/api/validate")
def validate_route():
    """Return validation summary for core datasets."""
    summary = {}
    count, errors = validate_file(
        PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product
    )
    summary["products"] = {"count": count, "errors": errors[:5]}
    count, errors = validate_file(
        RECIPES_PATH, [], RECIPES_SCHEMA, normalize_recipe
    )
    summary["recipes"] = {"count": count, "errors": errors[:5]}
    count, errors = validate_file(HISTORY_PATH, [], None)
    summary["history"] = {"count": count, "errors": errors[:5]}
    return jsonify(summary)
