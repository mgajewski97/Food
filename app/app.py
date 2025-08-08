from flask import Flask, render_template, request, jsonify
from datetime import date
import os

from utils import DEFAULT_UNIT, load_json, normalize_product, save_json

"""Flask application providing basic CRUD APIs for a pantry manager."""

app = Flask(__name__, static_folder="static", template_folder="templates")

BASE_DIR = os.path.dirname(__file__)
PRODUCTS_PATH = os.path.join(BASE_DIR, "data", "products.json")
RECIPES_PATH = os.path.join(BASE_DIR, "data", "recipes.json")
UNITS_PATH = os.path.join(BASE_DIR, "data", "units.json")
HISTORY_PATH = os.path.join(BASE_DIR, "data", "history.json")
FAVORITES_PATH = os.path.join(BASE_DIR, "data", "favorites.json")


def remove_used_products(used_ingredients):
    """Remove used ingredients from stored products."""
    products = load_json(PRODUCTS_PATH, [])
    products = [p for p in products if p.get("name") not in used_ingredients]
    save_json(PRODUCTS_PATH, products)

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
        products = load_json(PRODUCTS_PATH, [])
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
        save_json(PRODUCTS_PATH, products)
        return jsonify(products)
    if request.method == "PUT":
        payload = request.json or []
        if isinstance(payload, dict):
            payload = [payload]
        products = load_json(PRODUCTS_PATH, [])
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
        save_json(PRODUCTS_PATH, products)
        return jsonify(products)
    products = load_json(PRODUCTS_PATH, [])
    return jsonify([normalize_product(p) for p in products])

@app.route("/api/products/<string:name>", methods=["PUT", "DELETE"])
def modify_product(name):
    products = load_json(PRODUCTS_PATH, [])
    if request.method == "DELETE":
        products = [p for p in products if p.get("name") != name]
        save_json(PRODUCTS_PATH, products)
        return "", 204
    updated = normalize_product({**(request.json or {}), "name": name})
    for p in products:
        if p.get("name") == name:
            p.update(updated)
            break
    else:
        products.append(updated)
    save_json(PRODUCTS_PATH, products)
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
    products = load_json(PRODUCTS_PATH, [])
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
    products = load_json(PRODUCTS_PATH, [])

    # Build a set of available product keys, accepting both technical keys
    # ("key"/"name_key") and human readable names.
    product_keys = set()
    key_to_name = {}
    for p in products:
        key = p.get("key") or p.get("name_key") or p.get("name")
        name = p.get("name")
        if key:
            product_keys.add(key)
            if name:
                key_to_name[key] = name
        if name and name != key:
            product_keys.add(name)

    recipes = load_json(RECIPES_PATH, [])
    available = []
    for r in recipes:
        ingredients = r.get("ingredients", [])
        recipe_ok = True
        for ing in ingredients:
            if isinstance(ing, str):  # legacy format where ingredient is just a key
                product_key = ing
            elif isinstance(ing, dict):  # new format with {"product": key, ...}
                product_key = ing.get("product")
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
            available.append(r)

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

if __name__ == '__main__':
    app.run(debug=True)
