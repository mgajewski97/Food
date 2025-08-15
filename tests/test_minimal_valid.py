import json
import os
import sys
import math

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.utils import validate_file, normalize_product, normalize_recipe
from app.routes import PRODUCTS_SCHEMA, RECIPES_SCHEMA
from app import create_app


def test_minimal_product_and_recipe_validate(tmp_path):
    products = [
        {
            "name": "prod.test",
            "quantity": 1,
            "unit": "szt",
            "category": "uncategorized",
            "storage": "pantry",
        }
    ]
    recipes = [
        {
            "id": "recipe.test",
            "names": {"pl": "T", "en": "T"},
            "portions": 1,
            "time": "",
            "ingredients": [
                {
                    "productId": "prod.test",
                    "qty": 1,
                    "unitId": "unit.szt",
                    "optional": False,
                }
            ],
            "steps": [],
            "tags": [],
        }
    ]
    prod_path = tmp_path / "products.json"
    rec_path = tmp_path / "recipes.json"
    prod_path.write_text(json.dumps(products))
    rec_path.write_text(json.dumps(recipes))

    count, errors = validate_file(str(prod_path), [], PRODUCTS_SCHEMA, normalize_product)
    assert count == 1
    assert errors == []

    count, errors = validate_file(str(rec_path), [], RECIPES_SCHEMA, normalize_recipe)
    assert count == 1
    assert errors == []


def test_products_endpoint_returns_data():
    app = create_app()
    client = app.test_client()

    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


def test_recipes_pagination_and_sorting():
    app = create_app()
    client = app.test_client()

    resp = client.get("/api/recipes?page_size=5&sort_by=name&order=asc")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["page"] == 1
    assert data["page_size"] == 5
    names = [
        r["names"].get("pl") or r["names"].get("en") or r["id"]
        for r in data["items"]
    ]
    assert names == sorted(names, key=str.lower)

    total = data["total"]
    last_page = math.ceil(total / 5)
    resp_last = client.get(
        f"/api/recipes?page_size=5&page={last_page}&sort_by=name&order=desc"
    )
    data_last = resp_last.get_json()
    expected = total - 5 * (last_page - 1)
    assert len(data_last["items"]) == expected
    names_desc = [
        r["names"].get("pl") or r["names"].get("en") or r["id"]
        for r in data_last["items"]
    ]
    assert names_desc == sorted(names_desc, key=str.lower, reverse=True)
