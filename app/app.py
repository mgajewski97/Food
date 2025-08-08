from flask import Flask, render_template, request, jsonify
from datetime import date
import os

from utils import (
    load_json,
    normalize_product,
    normalize_recipe,
    save_json,
    validate_file,
)

"""Flask application providing basic CRUD APIs for a pantry manager."""

# CHANGELOG:
# - Moved JSON schemas to ``app/schemas`` and wired validation through utils.
# - Hardened API handlers with fail-soft data loading and ingredient normalization.
# - Added validation summary endpoint returning counts and warnings.

app = Flask(__name__, static_folder="static", template_folder="templates")

BASE_DIR = os.path.dirname(__file__)
SCHEMA_DIR = os.path.join(BASE_DIR, "schemas")
DATA_DIR = os.path.join(BASE_DIR, "data")
PRODUCTS_PATH = os.path.join(DATA_DIR, "products.json")
RECIPES_PATH = os.path.join(DATA_DIR, "recipes.json")
PRODUCTS_SCHEMA = os.path.join(SCHEMA_DIR, "products.schema.json")
RECIPES_SCHEMA = os.path.join(SCHEMA_DIR, "recipes.schema.json")
UNITS_PATH = os.path.join(DATA_DIR, "units.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
FAVORITES_PATH = os.path.join(DATA_DIR, "favorites.json")

# Run initial validation on startup to surface warnings without blocking app.
for _path, _schema, _norm in [
    (PRODUCTS_PATH, PRODUCTS_SCHEMA, normalize_product),
    (RECIPES_PATH, RECIPES_SCHEMA, normalize_recipe),
]:
    validate_file(_path, [], _schema, _norm)


def remove_used_products(used_ingredients):
    """Remove used ingredients from stored products."""
    products = load_json(PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product)
    products = [p for p in products if p.get("name") not in used_ingredients]
    save_json(PRODUCTS_PATH, products, PRODUCTS_SCHEMA, normalize_product)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return app.send_static_file('manifest.json')

@app.route('/service-worker.js')
def service_worker():
    return app.send_static_file('service-worker.js')

@app.route("/api/products", methods=["GET", "POST", "PUT"])
def products():
    if request.method == "POST":
        new_product = normalize_product(request.json or {})
        products = load_json(
            PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product
        )
        existing = next(
            (
                p
                for p in products
                if p.get("name") == new_product["name"]
                and p.get("category", "uncategorized") == new_product["category"]
                and p.get("storage", "pantry") == new_product["storage"]
            ),
            None,
        )
        if existing:
            try:
                existing_qty = float(existing.get("quantity", 0))
            except (TypeError, ValueError):
                existing_qty = 0
            existing["quantity"] = existing_qty + new_product["quantity"]
        else:
            products.append(new_product)
        save_json(PRODUCTS_PATH, products, PRODUCTS_SCHEMA, normalize_product)
        return jsonify(products)
    if request.method == "PUT":
        payload = request.json or []
        if isinstance(payload, dict):
            payload = [payload]
        products = load_json(
            PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product
        )
        for item in payload:
            item = normalize_product(item)
            existing = next(
                (
                    p
                    for p in products
                    if p.get("name") == item["name"]
                    and p.get("category", "uncategorized") == item["category"]
                    and p.get("storage", "pantry") == item["storage"]
                ),
                None,
            )
            if existing:
                existing.update(item)
            else:
                products.append(item)
        save_json(PRODUCTS_PATH, products, PRODUCTS_SCHEMA, normalize_product)
        return jsonify(products)
    products = load_json(PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product)
    return jsonify([normalize_product(p) for p in products])

@app.route("/api/products/<string:name>", methods=["PUT", "DELETE"])
def modify_product(name):
    products = load_json(PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product)
    if request.method == "DELETE":
        products = [p for p in products if p.get("name") != name]
        save_json(PRODUCTS_PATH, products, PRODUCTS_SCHEMA, normalize_product)
        return "", 204
    updated = normalize_product({**(request.json or {}), "name": name})
    for p in products:
        if p.get("name") == name:
            p.update(updated)
            break
    else:
        products.append(updated)
    save_json(PRODUCTS_PATH, products, PRODUCTS_SCHEMA, normalize_product)
    return jsonify(products)


@app.route("/api/units", methods=["GET", "PUT"])
def units():
    if request.method == "PUT":
        units = request.json or {}
        save_json(UNITS_PATH, units)
        return jsonify(units)
    return jsonify(load_json(UNITS_PATH, {}))

@app.route("/api/ocr-match", methods=["POST"])
def ocr_match():
    payload = request.json or {}
    items = payload.get("items", [])
    products = load_json(PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product)
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

@app.route("/api/recipes")
def recipes():
    products = load_json(PRODUCTS_PATH, [], PRODUCTS_SCHEMA, normalize_product)

    # Build a set of available product keys, accepting both technical keys
    # ("key"/"name_key") and human readable names.
    product_keys = set()
    for p in products:
        key = p.get("key") or p.get("name_key") or p.get("name")
        name = p.get("name")
        if key:
            product_keys.add(key)
        if name and name != key:
            product_keys.add(name)

    recipes = load_json(RECIPES_PATH, [], RECIPES_SCHEMA, normalize_recipe)
    available = []
    for r in recipes:
        ingredients = r.get("ingredients", [])
        recipe_ok = True
        normalized_ings = []
        for ing in ingredients:
            if isinstance(ing, str):
                product_key = ing
                normalized_ings.append({"product": ing})
            elif isinstance(ing, dict):
                product_key = ing.get("product")
                normalized_ings.append(
                    {
                        "product": product_key,
                        "quantity": ing.get("quantity"),
                        "unit": ing.get("unit"),
                    }
                )
            else:
                product_key = None

            if not product_key:
                app.logger.warning("Malformed ingredient entry: %r", ing)
                recipe_ok = False
                break
            if product_key not in product_keys:
                recipe_ok = False
                break
        if recipe_ok:
            recipe_copy = dict(r)
            recipe_copy["ingredients"] = normalized_ings
            available.append(recipe_copy)

    return jsonify(available)


@app.route("/api/history", methods=["GET", "POST"])
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


@app.route("/api/favorites", methods=["GET", "PUT"])
def favorites():
    """Store or retrieve favorite recipes."""
    if request.method == "PUT":
        favs = request.json or []
        save_json(FAVORITES_PATH, favs)
        return jsonify(favs)
    return jsonify(load_json(FAVORITES_PATH, []))


@app.route("/api/validate")
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

if __name__ == '__main__':
    app.run(debug=True)
