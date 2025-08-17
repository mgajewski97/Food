from collections import defaultdict
from typing import Dict, List


def convert_flat_to_nested(products: List[Dict]) -> Dict[str, Dict[str, List[Dict]]]:
    """Convert flat product list into nested storage/category mapping.

    Missing ``storage`` or ``category`` values default to ``storage.pantry`` and
    ``category.uncategorized`` respectively. Existing ``storage``/``category``
    values are prefixed when not already in canonical form.
    """
    nested: Dict[str, Dict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))
    for prod in products:
        storage = prod.get("storage", "pantry")
        category = prod.get("category", "uncategorized")
        if not str(storage).startswith("storage."):
            storage = f"storage.{storage}"
        if not str(category).startswith("category."):
            category = f"category.{category}"
        item = dict(prod)
        item.pop("storage", None)
        item.pop("category", None)
        nested[storage][category].append(item)
    # convert defaultdicts to regular dicts
    return {s: {c: items for c, items in cats.items()} for s, cats in nested.items()}
