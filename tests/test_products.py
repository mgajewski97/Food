import os
import sys
import json
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.utils.product_io import load_products_nested, save_products_nested


def _sample_data():
    return {
        "storage.fridge": {
            "category.dairy-eggs": [
                {
                    "name": "milk",
                    "quantity": 1,
                    "unit": "l",
                    "threshold": 1,
                    "main": True,
                    "level": None,
                    "is_spice": False,
                    "tags": [],
                }
            ]
        },
        "storage.pantry": {
            "category.spices": [
                {
                    "name": "pepper",
                    "quantity": 2,
                    "unit": "g",
                    "threshold": 1,
                    "main": True,
                    "level": "medium",
                    "is_spice": True,
                    "tags": [],
                }
            ]
        },
    }


def test_roundtrip_conversion(tmp_path: Path):
    path = tmp_path / "products.json"
    data = _sample_data()
    path.write_text(json.dumps(data, indent=2))

    flat = load_products_nested(str(path))
    assert any(
        p["name"] == "milk" and p["storage"] == "storage.fridge" for p in flat
    )
    assert any(p["name"] == "pepper" and p["category"] == "category.spices" for p in flat)

    save_products_nested(str(path), flat)
    reloaded = json.loads(path.read_text())
    assert reloaded == data


def test_modify_and_save(tmp_path: Path):
    path = tmp_path / "products.json"
    path.write_text(json.dumps(_sample_data(), indent=2))

    products = load_products_nested(str(path))
    pepper = next(p for p in products if p["name"] == "pepper")
    pepper["quantity"] = 5
    save_products_nested(str(path), products)

    products2 = load_products_nested(str(path))
    assert any(p["name"] == "pepper" and p["quantity"] == 5 for p in products2)
