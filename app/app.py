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

@app.route('/api/products', methods=['GET', 'POST'])
def products():
    if request.method == 'POST':
        new_product = request.json or {}
        new_product['unit'] = UNIT
        try:
            new_product['quantity'] = float(new_product.get('quantity', 0))
        except (TypeError, ValueError):
            new_product['quantity'] = 0
        products = load_json(PRODUCTS_PATH)
        products.append(new_product)
        save_json(PRODUCTS_PATH, products)
        return jsonify(products)
    products = load_json(PRODUCTS_PATH)
    products = [apply_defaults(p) for p in products]
    return jsonify(products)

@app.route('/api/products/<string:name>', methods=['DELETE', 'PUT'])
def modify_product(name):
    products = load_json(PRODUCTS_PATH)
    if request.method == 'DELETE':
        products = [p for p in products if p['name'] != name]
        save_json(PRODUCTS_PATH, products)
        return '', 204
    updated = apply_defaults(request.json)
    for i, p in enumerate(products):
        if p['name'] == name:
            products[i] = updated
            break
    save_json(PRODUCTS_PATH, products)
    return jsonify(updated)

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
