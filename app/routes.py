import json
import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from email.utils import parsedate_to_datetime
from flask import Blueprint, current_app, g, jsonify, render_template, request

from .errors import DomainError, error_response

from .search import search_products
from .utils import (
    file_lock,
    file_etag,
    file_mtime_rfc1123,
    load_json,
    load_json_validated,
    normalize_product,
    normalize_recipe,
    _safe_float,
    safe_write,
    save_json,
    validate_file,
    validate_items,
    _validate,
    validate_payload,
)
from .utils.logging import log_error_with_trace, log_warning_with_trace


def _log_error(exc: Exception, context: Dict[str, Any]) -> str:
    trace_id = log_error_with_trace(exc, context)
    g.trace_id = trace_id
    return trace_id

# FIX: 2024-05-06


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


def _validate_products_file() -> Tuple[int, List[str]]:
    """Validate the domain products file against the product schema."""
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        return 0, [str(exc)]
    products = data if isinstance(data, list) else data.get("products", [])
    validated, errors = _validate(
        products, PRODUCTS_SCHEMA, coerce=normalize_product
    )
    count = len(validated) if isinstance(validated, list) else 0
    return count, errors


def run_initial_validation() -> None:
    """Validate core datasets once on application startup."""
    count, errors = _validate_products_file()
    for err in errors:
        logger.info("products.json: %s", err)
    count, errors = validate_file(RECIPES_PATH, [], RECIPES_SCHEMA, normalize_recipe)
    for err in errors:
        logger.info("recipes.json: %s", err)


def _load_products_compat(context: Dict[str, Any]):
    """Return legacy product list built from normalized domain data."""
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise ValueError(str(exc))

    categories = {c.get("id"): c for c in data.get("categories", [])}
    units_list = load_json(UNITS_PATH, [])
    units = {u.get("id"): u for u in units_list}
    legacy: List[Dict[str, Any]] = []

    for prod in data.get("products", []):
        cat = categories.get(prod.get("categoryId"))
        unit = units.get(prod.get("unitId"))
        if not cat:
            log_warning_with_trace(
                f"product {prod.get('id')} missing category {prod.get('categoryId')}",
                context,
            )
            continue
        if not unit:
            log_warning_with_trace(
                f"product {prod.get('id')} missing unit {prod.get('unitId')}",
                context,
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
            "amount": 0,
            "threshold": 0,
            "storage": "pantry",
            "main": True,
            "package_size": 1,
            "pack_size": None,
            "level": None,
            "is_spice": category_key == "spices",
            "aliases": prod.get("aliases", []),
            "tags": [],
            "flags": False,
        }

        if item["is_spice"]:
            item["level"] = "none"

        legacy.append(item)

    legacy.sort(key=lambda p: p.get("name_pl", "").lower())
    if data.get("products") and not legacy:
        log_warning_with_trace("no valid products emitted", context)
    return legacy


def _load_recipes(locale: str = "pl", context: Optional[Dict[str, Any]] = None):
    """Return normalized recipes enriched with display names.

    Ingredients keep their identifiers while ``productName`` and ``unitName``
    are resolved for the requested locale. Missing references are kept so the
    caller can decide how to handle unknown items.
    """

    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            products_data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(str(exc))

    products = {p.get("id"): p for p in products_data.get("products", [])}
    units_list = load_json(UNITS_PATH, [])
    units = {u.get("id"): u for u in units_list}

    try:
        recipes, errors = load_json(
            RECIPES_PATH,
            [],
            RECIPES_SCHEMA,
            normalize_recipe,
            return_errors=True,
        )
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(str(exc))
    if errors:
        log_warning_with_trace("; ".join(errors), context or {})

    result = []
    for rec in recipes:
        ing_list = []
        for ing in rec.get("ingredients", []):
            pid = ing.get("productId")
            uid = ing.get("unitId")

            prod = products.get(pid)
            prod_name = None
            if prod:
                prod_name = (
                    prod.get("names", {}).get(locale)
                    or prod.get("names", {}).get("en")
                    or prod.get("id")
                )

            unit = units.get(uid)
            unit_name = None
            if unit:
                unit_name = (
                    unit.get("names", {}).get(locale)
                    or unit.get("names", {}).get("en")
                    or unit.get("id")
                )

            ing_list.append(
                {
                    "productId": pid,
                    "productName": prod_name,
                    "qty": ing.get("qty"),
                    "unitId": uid,
                    "unitName": unit_name,
                    "optional": ing.get("optional", False),
                    "note": ing.get("note"),
                }
            )

        result.append(
            {
                "id": rec.get("id"),
                "names": rec.get("names", {}),
                "time": rec.get("time"),
                "servings": rec.get("portions"),
                "steps": rec.get("steps", []),
                "ingredients": ing_list,
                "amount": 0,
                "threshold": 0,
                "storage": "pantry",
                "flags": False,
            }
        )

    result.sort(key=lambda r: r.get("names", {}).get("pl", "").lower())
    if recipes and not result:
        log_warning_with_trace("no valid recipes emitted", context or {})
    return result


def remove_used_products(used_ingredients):
    """Remove used ingredients from stored products."""
    with file_lock(PRODUCTS_PATH):
        products = load_json_validated(
            PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product
        )
        products = [p for p in products if p.get("name") not in used_ingredients]
        safe_write(PRODUCTS_PATH, products)


def _compute_app_version() -> str:
    """Return a short hash representing current static/data mtimes."""
    import hashlib

    paths = []
    static_dir = os.path.join(BASE_DIR, "static")
    for root, _, files in os.walk(static_dir):
        for fn in files:
            paths.append(os.path.join(root, fn))
    paths.extend([PRODUCTS_PATH, RECIPES_PATH])

    mtimes: List[str] = []
    for p in paths:
        try:
            mtimes.append(str(os.path.getmtime(p)))
        except OSError:  # pragma: no cover - missing file
            continue
    digest = hashlib.sha256("".join(sorted(mtimes)).encode("utf-8")).hexdigest()
    return digest[:8]


@bp.route("/")
def index():
    version = _compute_app_version()
    return render_template("index.html", app_version=version)


@bp.route("/version.txt")
def version_txt():
    version = _compute_app_version()
    return (
        version,
        200,
        {"Content-Type": "text/plain", "Cache-Control": "no-cache"},
    )


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
        return error_response("not found", 404)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = _log_error(
            exc, {"endpoint": "/api/ui/<lang>", "lang": lang}
        )
        return error_response("Internal Server Error", 500, trace_id)
    return jsonify(data)


@bp.route("/api/domain")
def domain():
    """Return normalized domain data of products, categories and units."""

    context = {"endpoint": "/api/domain", "args": request.args.to_dict()}
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = _log_error(exc, context)
        return error_response("Internal Server Error", 500, trace_id)

    products = data.get("products", [])
    categories = data.get("categories", [])
    units = load_json(UNITS_PATH, [])
    data["units"] = units
    first_id = products[0].get("id") if products else None
    logger.info(
        "domain products=%d categories=%d units=%d first_product=%s",
        len(products),
        len(categories),
        len(units),
        first_id,
    )
    return jsonify(data)


@bp.route("/api/search")
def search():
    """Search products in the domain using query and locale."""
    query = request.args.get("q", "")
    locale = request.args.get("locale", "pl")
    try:
        results = search_products(query, locale)
    except ValueError as exc:
        logger.info(str(exc))
        return error_response(str(exc), 400)
    return jsonify(results)


@bp.route("/api/products")
def products():
    """Return product dataset used by the frontend."""
    context = {"endpoint": "/api/products", "args": request.args.to_dict()}
    try:
        with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        products = data["products"] if isinstance(data, dict) else None
        if not isinstance(products, list):
            raise KeyError("products list missing or invalid")
    except (KeyError, TypeError, ValueError) as exc:
        trace_id = _log_error(exc, context)
        return error_response("Invalid product data format", 500, trace_id)
    except Exception as exc:
        trace_id = _log_error(exc, context)
        return error_response("Unable to load product data", 500, trace_id)

    etag = file_etag(PRODUCTS_PATH)
    last_modified = file_mtime_rfc1123(PRODUCTS_PATH)
    inm = request.headers.get("If-None-Match")
    ims = request.headers.get("If-Modified-Since")
    mtime = datetime.fromtimestamp(os.path.getmtime(PRODUCTS_PATH), timezone.utc)
    mtime = mtime.replace(microsecond=0)
    if inm == etag:
        resp = current_app.response_class(status=304)
        resp.headers["ETag"] = etag
        resp.headers["Last-Modified"] = last_modified
        return resp
    if ims:
        try:
            since = parsedate_to_datetime(ims)
            if since >= mtime:
                resp = current_app.response_class(status=304)
                resp.headers["ETag"] = etag
                resp.headers["Last-Modified"] = last_modified
                return resp
        except (TypeError, ValueError, OverflowError):
            pass

    resp = jsonify(products)
    resp.headers["ETag"] = etag
    resp.headers["Last-Modified"] = last_modified
    return resp

@bp.route("/api/units", methods=["GET", "PUT"])
def units():
    if request.method == "PUT":
        units = request.json or []
        save_json(UNITS_PATH, units)
        return jsonify(units)
    return jsonify(load_json(UNITS_PATH, []))


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
        results.append(
            {
                "original": raw,
                "matches": [
                    {
                        "name": m.get("name"),
                        "category": m.get("category"),
                        "storage": m.get("storage"),
                    }
                    for m in matches
                ],
            }
        )
    return jsonify(results)


@bp.route("/api/recipes")
def recipes():
    """Return normalized recipes with resolved display names."""

    context = {"endpoint": "/api/recipes", "args": request.args.to_dict()}
    locale = request.args.get("locale", "pl")
    try:
        try:
            recipes = _load_recipes(locale, context)
        except ValueError as exc:  # pragma: no cover - defensive
            trace_id = _log_error(exc, context)
            return error_response("Internal Server Error", 500, trace_id)

        sort_by = request.args.get("sort_by", "name")
        order = request.args.get("order", "asc").lower()
        page = int(max(1, _safe_float(request.args.get("page", 1), 1)))
        page_size = int(
            max(1, min(200, _safe_float(request.args.get("page_size", 50), 50)))
        )

        if sort_by:
            def _key(r):
                if sort_by == "name":
                    nm = (
                        r.get("names", {}).get(locale)
                        or r.get("names", {}).get("en")
                        or r.get("id")
                    )
                    return nm.lower()
                val = r.get(sort_by)
                if isinstance(val, str):
                    return val.lower()
                return val

            recipes.sort(key=_key)
            if order == "desc":
                recipes.reverse()

        total = len(recipes)
        start = (page - 1) * page_size
        end = start + page_size
        items = recipes[start:end]
        first_id = items[0].get("id") if items else None
        logger.info("recipes count=%d first=%s", total, first_id)

        etag = file_etag(RECIPES_PATH)
        last_modified = file_mtime_rfc1123(RECIPES_PATH)
        inm = request.headers.get("If-None-Match")
        ims = request.headers.get("If-Modified-Since")
        mtime = datetime.fromtimestamp(os.path.getmtime(RECIPES_PATH), timezone.utc)
        mtime = mtime.replace(microsecond=0)
        if inm == etag:
            resp = current_app.response_class(status=304)
            resp.headers["ETag"] = etag
            resp.headers["Last-Modified"] = last_modified
            return resp
        if ims:
            try:
                since = parsedate_to_datetime(ims)
                if since >= mtime:
                    resp = current_app.response_class(status=304)
                    resp.headers["ETag"] = etag
                    resp.headers["Last-Modified"] = last_modified
                    return resp
            except (TypeError, ValueError, OverflowError):
                pass
        resp = jsonify(
            {"items": items, "page": page, "page_size": page_size, "total": total}
        )
        resp.headers["ETag"] = etag
        resp.headers["Last-Modified"] = last_modified
        return resp
    except Exception as exc:  # pragma: no cover - defensive
        trace_id = _log_error(exc, context)
        return error_response("Internal Server Error", 500, trace_id)


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
        trace_id = _log_error(exc, context)
        return error_response("Internal Server Error", 500, trace_id)


def _generate_shopping_list(selection: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    recipes = load_json_validated(
        RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe
    )
    recipes_map = {r.get("id"): r for r in recipes}
    aggregate: Dict[Tuple[str, str], float] = {}
    optional_map: Dict[Tuple[str, str], bool] = {}
    for sel in selection:
        rid = sel.get("id")
        servings = max(0.0, _safe_float(sel.get("servings", 0)))
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
        payload = request.get_json(silent=True)
        validate_payload(payload, "shopping-selection.schema.json")
        selection = payload.get("recipes", [])
        items = _generate_shopping_list(selection)
        save_json(SHOPPING_PATH, items)
        return jsonify(items)
    return jsonify(load_json(SHOPPING_PATH, []))


@bp.route("/api/shopping/<string:product_id>", methods=["PATCH"])
def shopping_mark(product_id: str):
    payload = request.get_json(silent=True)
    validate_payload(payload, "shopping-mark.schema.json")
    items = load_json(SHOPPING_PATH, [])
    flag = payload.get("inCart")
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
            qty = max(0.0, _safe_float(it.get("quantity_to_buy", 0)))
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
        load_json_validated(PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize=normalize_product)
        load_json_validated(RECIPES_PATH, RECIPES_SCHEMA, normalize=normalize_recipe)
    except ValueError as exc:
        trace_id = _log_error(exc, {"endpoint": "/api/health"})
        return error_response("Internal Server Error", 500, trace_id)
    return jsonify({"ok": True})


@bp.route("/api/_health")
def health_new():
    """Lightweight health check exposing dataset stats."""
    context = {"endpoint": "/api/_health", "args": request.args.to_dict()}
    try:
        products = _load_products_compat(context)
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
        trace_id = _log_error(exc, context)
        return error_response("Internal Server Error", 500, trace_id)


@bp.route("/api/validate")
def validate_route():
    """Return validation summary for core datasets."""
    summary = {}
    count, errors = _validate_products_file()
    summary["products"] = {"count": count, "errors": errors[:5]}
    count, errors = validate_file(RECIPES_PATH, [], RECIPES_SCHEMA, normalize_recipe)
    summary["recipes"] = {"count": count, "errors": errors[:5]}
    count, errors = validate_file(HISTORY_PATH, [], None)
    summary["history"] = {"count": count, "errors": errors[:5]}
    return jsonify(summary)
