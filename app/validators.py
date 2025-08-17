import os
from typing import Dict, List

from .utils import _validate

# Schema path for nested products structure
PRODUCTS_SCHEMA = os.path.join(os.path.dirname(__file__), "schemas", "product.schema.json")


def validate_products(products: List[Dict[str, Any]]) -> List[str]:
    """Validate flattened products against the nested schema.

    The function groups the flat list by ``storage`` and ``category`` and then
    validates the nested representation using the JSON schema. It returns a
    list of validation error messages. An empty list indicates the dataset is
    valid.
    """
    grouped: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for prod in products:
        storage = prod.get("storage")
        category = prod.get("category")
        if not storage or not category:
            continue
        grouped.setdefault(storage, {}).setdefault(category, []).append(
            {k: v for k, v in prod.items() if k not in ("storage", "category")}
        )
    _, errors = _validate(grouped, PRODUCTS_SCHEMA)
    return errors
