import os
import json
from collections import defaultdict
from typing import Any, Dict, List

from . import load_json, save_json

# Path to the product schema relative to this module
_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "schemas", "product.schema.json")


def load_products_nested(path: str) -> List[Dict[str, Any]]:
    """Load products from ``path`` in nested form and flatten them.

    The JSON file is expected to be structured as ``storage -> category ->
    [products]``. Each returned product dict contains the original fields
    plus ``storage`` and ``category`` keys preserved from the nesting.
    Invalid or missing files return an empty list.
    """
    data = load_json(path, {}, _SCHEMA_PATH)
    if not isinstance(data, dict):
        return []

    flat: List[Dict[str, Any]] = []
    for storage, categories in data.items():
        if not isinstance(categories, dict):
            continue
        for category, items in categories.items():
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                obj = dict(item)
                obj["storage"] = storage
                obj["category"] = category
                flat.append(obj)
    return flat


def save_products_nested(path: str, products: List[Dict[str, Any]]) -> None:
    """Persist ``products`` to ``path`` using the nested structure.

    ``products`` is a flat list where every item contains ``storage`` and
    ``category`` keys. The function groups items by these keys and writes the
    nested representation to disk validating against the product schema.
    """
    nested: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for prod in products:
        storage = prod.get("storage")
        category = prod.get("category")
        if not storage or not category:
            continue
        item = dict(prod)
        item.pop("storage", None)
        item.pop("category", None)
        nested[storage][category].append(item)

    # Convert defaultdicts to regular dicts for serialization
    data: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        storage: {cat: items for cat, items in categories.items()}
        for storage, categories in nested.items()
    }
    save_json(path, data, _SCHEMA_PATH)
