import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app
from app.routes import PRODUCTS_PATH, RECIPES_PATH
from app.utils.product_io import load_products_nested, save_products_nested

def _modify_file(path, mutate):
    with open(path, "r", encoding="utf-8") as fh:
        original = fh.read()
    if path == PRODUCTS_PATH:
        data = load_products_nested(path)
        mutate(data)
        save_products_nested(path, data)
    else:
        data = json.loads(original)
        mutate(data)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
    return original

def test_products_etag_and_conditional_headers():
    app = create_app()
    client = app.test_client()

    resp = client.get("/api/products")
    assert resp.status_code == 200
    etag = resp.headers.get("ETag")
    last_mod = resp.headers.get("Last-Modified")
    first = resp.get_json()

    resp2 = client.get("/api/products", headers={"If-None-Match": etag})
    assert resp2.status_code == 304

    resp3 = client.get("/api/products", headers={"If-Modified-Since": last_mod})
    assert resp3.status_code == 304

    def mutate(products):
        prod = products[0]
        prod["name"] = prod.get("name", "") + " X"

    original = _modify_file(PRODUCTS_PATH, mutate)
    try:
        resp4 = client.get("/api/products")
        assert resp4.status_code == 200
        assert resp4.headers.get("ETag") != etag
        data4 = resp4.get_json()
        assert data4 != first
    finally:
        with open(PRODUCTS_PATH, "w", encoding="utf-8") as fh:
            fh.write(original)

def test_recipes_etag_and_conditional_headers():
    app = create_app()
    client = app.test_client()

    resp = client.get("/api/recipes?locale=en")
    assert resp.status_code == 200
    etag = resp.headers.get("ETag")
    last_mod = resp.headers.get("Last-Modified")
    first = resp.get_json()["items"]

    resp2 = client.get(
        "/api/recipes?locale=en", headers={"If-None-Match": etag}
    )
    assert resp2.status_code == 304

    resp3 = client.get(
        "/api/recipes?locale=en", headers={"If-Modified-Since": last_mod}
    )
    assert resp3.status_code == 304

    def mutate(data):
        rec = data[0]
        rec.setdefault("names", {})
        rec["names"]["en"] = rec["names"].get("en", "") + " X"

    original = _modify_file(RECIPES_PATH, mutate)
    try:
        resp4 = client.get("/api/recipes?locale=en")
        assert resp4.status_code == 200
        assert resp4.headers.get("ETag") != etag
        data4 = resp4.get_json()["items"]
        assert data4 != first
    finally:
        with open(RECIPES_PATH, "w", encoding="utf-8") as fh:
            fh.write(original)
