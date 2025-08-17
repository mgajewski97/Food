import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.utils import normalize_product
from app import utils as utils_mod


def test_normalize_product_derive_from_id():
    utils_mod._DOMAIN_PRODUCTS = {
        "prod.allspice": {
            "names": {"pl": "Ziele angielskie"},
            "unitId": "unit.lvl",
            "categoryId": "category.spices",
        }
    }
    utils_mod._ALIAS_TO_ID = {}
    data = {"productId": "prod.allspice"}
    res = normalize_product(data)
    assert res["name"] == "Ziele angielskie"
    assert res["unit"] == "lvl"
    assert res["category"] == "spices"


def test_normalize_product_resolves_alias():
    utils_mod._DOMAIN_PRODUCTS = {
        "prod.basil": {
            "names": {"pl": "Bazylia"},
            "unitId": "unit.lvl",
            "categoryId": "category.spices",
            "aliases": ["product.basil"],
        }
    }
    utils_mod._ALIAS_TO_ID = {utils_mod._normalize_alias("product.basil"): "prod.basil"}
    data = {"alias": "product.basil"}
    res = normalize_product(data)
    assert res["name"] == "Bazylia"
    assert res["category"] == "spices"


def test_normalize_product_defaults_and_coercion():
    data = {"name": "", "unit": "PCS", "category": "", "quantity": "2", "threshold": "", "main": "false"}
    res = normalize_product(data)
    assert res["name"] == "Unknown"
    assert res["unit"] == "szt"
    assert res["category"] == "uncategorized"
    assert res["quantity"] == 2
    assert res["threshold"] == 0
    assert res["main"] is False
