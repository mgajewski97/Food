from flask import Flask, render_template, request, jsonify
from datetime import date
import json
import os

app = Flask(__name__, static_folder='static', template_folder='templates')

BASE_DIR = os.path.dirname(__file__)
PRODUCTS_PATH = os.path.join(BASE_DIR, 'data', 'products.json')
RECIPES_PATH = os.path.join(BASE_DIR, 'data', 'recipes.json')
UNIT = "szt."
HISTORY_PATH = os.path.join(BASE_DIR, 'data', 'history.json')

def apply_defaults(product):
    product.setdefault('category', 'uncategorized')
    product.setdefault('storage', 'pantry')
    product.setdefault('main', False)
    product.setdefault('threshold', None)
    product.setdefault('package_size', 1)
    return product

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def remove_used_products(used_ingredients):
    products = load_json(PRODUCTS_PATH)
    products = [p for p in products if p['name'] not in used_ingredients]
    save_json(PRODUCTS_PATH, products)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/products', methods=['GET', 'POST', 'PUT'])
def products():
    if request.method == 'POST':
        new_product = request.json or {}
        new_product['unit'] = new_product.get('unit', UNIT)
        try:
            new_product['quantity'] = float(new_product.get('quantity', 0))
        except (TypeError, ValueError):
            new_product['quantity'] = 0
        try:
            new_product['package_size'] = float(new_product.get('package_size', 1)) or 1
        except (TypeError, ValueError):
            new_product['package_size'] = 1
        try:
            thresh = new_product.get('threshold')
            new_product['threshold'] = float(thresh) if thresh is not None else None
        except (TypeError, ValueError):
            new_product['threshold'] = None
        new_product['main'] = bool(new_product.get('main', False))
        new_product = apply_defaults(new_product)
        products = load_json(PRODUCTS_PATH)
        found = False
        for p in products:
            if (
                p.get('name') == new_product['name'] and
                p.get('category', 'uncategorized') == new_product['category'] and
                p.get('storage', 'pantry') == new_product['storage']
            ):
                try:
                    existing_qty = float(p.get('quantity', 0))
                except (TypeError, ValueError):
                    existing_qty = 0
                p['quantity'] = existing_qty + new_product['quantity']
                found = True
                break
        if not found:
            products.append(new_product)
        save_json(PRODUCTS_PATH, products)
        return jsonify(products)
    if request.method == 'PUT':
        payload = request.json or []
        if isinstance(payload, dict):
            payload = [payload]
        products = load_json(PRODUCTS_PATH)
        for item in payload:
            item['unit'] = item.get('unit', UNIT)
            try:
                item['quantity'] = float(item.get('quantity', 0))
            except (TypeError, ValueError):
                item['quantity'] = 0
            try:
                item['package_size'] = float(item.get('package_size', 1)) or 1
            except (TypeError, ValueError):
                item['package_size'] = 1
            try:
                thresh = item.get('threshold')
                item['threshold'] = float(thresh) if thresh is not None else None
            except (TypeError, ValueError):
                item['threshold'] = None
            item['main'] = bool(item.get('main', False))
            item = apply_defaults(item)
            found = False
            for p in products:
                if (
                    p.get('name') == item['name'] and
                    p.get('category', 'uncategorized') == item['category'] and
                    p.get('storage', 'pantry') == item['storage']
                ):
                    p['quantity'] = item['quantity']
                    p['unit'] = item['unit']
                    p['threshold'] = item['threshold']
                    p['main'] = item['main']
                    p['package_size'] = item['package_size']
                    found = True
                    break
            if not found:
                products.append(item)
        save_json(PRODUCTS_PATH, products)
        return jsonify(products)
    products = load_json(PRODUCTS_PATH)
    products = [apply_defaults(p) for p in products]
    return jsonify(products)

@app.route('/api/products/<string:name>', methods=['PUT', 'DELETE'])
def modify_product(name):
    products = load_json(PRODUCTS_PATH)
    if request.method == 'DELETE':
        products = [p for p in products if p['name'] != name]
        save_json(PRODUCTS_PATH, products)
        return '', 204
    updated = request.json or {}
    updated['unit'] = updated.get('unit', UNIT)
    try:
        updated['quantity'] = float(updated.get('quantity', 0))
    except (TypeError, ValueError):
        updated['quantity'] = 0
    try:
        updated['package_size'] = float(updated.get('package_size', 1)) or 1
    except (TypeError, ValueError):
        updated['package_size'] = 1
    try:
        thresh = updated.get('threshold')
        updated['threshold'] = float(thresh) if thresh is not None else None
    except (TypeError, ValueError):
        updated['threshold'] = None
    updated['main'] = bool(updated.get('main', False))
    updated = apply_defaults(updated)
    for p in products:
        if p.get('name') == name:
            p.update(updated)
            break
    else:
        products.append(updated)
    save_json(PRODUCTS_PATH, products)
    return jsonify(products)

@app.route('/api/recipes')
def recipes():
    products = load_json(PRODUCTS_PATH)
    product_names = {p['name'] for p in products}
    recipes = load_json(RECIPES_PATH)
    available = [r for r in recipes if all(ing in product_names for ing in r['ingredients'])]
    return jsonify(available)


@app.route('/api/history', methods=['GET', 'POST'])
def history():
    if request.method == 'POST':
        entry = request.json
        if 'date' not in entry:
            entry['date'] = date.today().isoformat()
        history = load_json(HISTORY_PATH)
        history.append(entry)
        save_json(HISTORY_PATH, history)
        if entry.get('used_ingredients'):
            remove_used_products(entry['used_ingredients'])
        return jsonify(history)
    return jsonify(load_json(HISTORY_PATH))

if __name__ == '__main__':
    app.run(debug=True)
