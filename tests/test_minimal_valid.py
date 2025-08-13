import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.routes import PRODUCTS_SCHEMA, RECIPES_SCHEMA
from app.utils import normalize_product, normalize_recipe, validate_file


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
