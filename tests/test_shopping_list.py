import json
import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app
import app.routes as routes


def _setup_data(tmp_path):
    products = [
        {
            "name": "prod.rice",
            "quantity": 100,
            "unit": "g",
            "category": "uncategorized",
            "storage": "pantry",
        },
        {
            "name": "prod.water",
            "quantity": 500,
            "unit": "ml",
            "category": "uncategorized",
            "storage": "pantry",
        },
        {
            "name": "prod.egg",
            "quantity": 1,
            "unit": "szt",
            "category": "uncategorized",
            "storage": "pantry",
        },
    ]
    recipes = [
        {
            "id": "recipe.a",
            "names": {"pl": "A", "en": "A"},
            "portions": 2,
            "time": "",
            "ingredients": [
                {
                    "productId": "prod.rice",
                    "qty": 100,
                    "unitId": "unit.g",
                    "optional": False,
                },
                {
                    "productId": "prod.water",
                    "qty": 1,
                    "unitId": "unit.l",
                    "optional": True,
                },
            ],
            "steps": [],
            "tags": [],
        },
        {
            "id": "recipe.b",
            "names": {"pl": "B", "en": "B"},
            "portions": 1,
            "time": "",
            "ingredients": [
                {
                    "productId": "prod.rice",
                    "qty": 0.2,
                    "unitId": "unit.kg",
                    "optional": False,
                },
                {
                    "productId": "prod.egg",
                    "qty": 2,
                    "unitId": "unit.szt",
                    "optional": False,
                },
            ],
            "steps": [],
            "tags": [],
        },
    ]

    prod_path = tmp_path / "products.json"
    rec_path = tmp_path / "recipes.json"
    shop_path = tmp_path / "shopping.json"
    prod_path.write_text(json.dumps(products))
    rec_path.write_text(json.dumps(recipes))
    routes.PRODUCTS_PATH = str(prod_path)
    routes.RECIPES_PATH = str(rec_path)
    routes.SHOPPING_PATH = str(shop_path)


def test_generate_and_subtract_pantry(tmp_path):
    _setup_data(tmp_path)
    app = create_app()
    client = app.test_client()

    payload = {
        "recipes": [
            {"id": "recipe.a", "servings": 4},
            {"id": "recipe.b", "servings": 2},
        ]
    }
    resp = client.post("/api/shopping", json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    expected = [
        {
            "productId": "prod.rice",
            "unitId": "unit.g",
            "quantity_to_buy": 500.0,
            "optional": False,
            "in_cart": False,
        },
        {
            "productId": "prod.water",
            "unitId": "unit.ml",
            "quantity_to_buy": 1500.0,
            "optional": True,
            "in_cart": False,
        },
        {
            "productId": "prod.egg",
            "unitId": "unit.szt",
            "quantity_to_buy": 3.0,
            "optional": False,
            "in_cart": False,
        },
    ]
    assert sorted(data, key=lambda x: x["productId"]) == sorted(
        expected, key=lambda x: x["productId"]
    )
    resp_get = client.get("/api/shopping")
    assert resp_get.get_json() == data


def test_mark_and_finalize_updates_pantry(tmp_path):
    _setup_data(tmp_path)
    app = create_app()
    client = app.test_client()

    client.post(
        "/api/shopping",
        json={"recipes": [{"id": "recipe.a", "servings": 4}, {"id": "recipe.b", "servings": 2}]},
    )

    client.patch("/api/shopping/prod.rice", json={"inCart": True})
    client.patch("/api/shopping/prod.egg", json={"inCart": True})

    resp = client.post("/api/shopping/confirm")
    remaining = resp.get_json()
    assert len(remaining) == 1 and remaining[0]["productId"] == "prod.water"

    with open(routes.PRODUCTS_PATH) as f:
        products = json.load(f)
    rice = next(p for p in products if p["name"] == "prod.rice")
    egg = next(p for p in products if p["name"] == "prod.egg")
    water = next(p for p in products if p["name"] == "prod.water")
    assert rice["quantity"] == 600.0
    assert egg["quantity"] == 4.0
    assert water["quantity"] == 500.0
