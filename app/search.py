import json
import os
import re
import unicodedata
from typing import Dict, List

# Path to products data
_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "products.json")


def _strip_diacritics(text: str) -> str:
    """Return text stripped from diacritics."""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def _normalize(text: str) -> str:
    """Lowercase text, strip diacritics and collapse whitespace."""
    text = _strip_diacritics(text.lower())
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


# Build search index at module import time
_INDEX: Dict[str, List[Dict[str, object]]] = {"pl": [], "en": []}

if os.path.exists(_DATA_PATH):
    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    products = data.get("products", [])
    for prod in products:
        aliases = []
        for alias in prod.get("aliases", []) or []:
            # aliases are stable identifiers: "product.cashew_nuts" -> "cashew nuts"
            if alias.startswith("product."):
                alias = alias.split(".", 1)[1]
            alias = alias.replace("_", " ").replace("-", " ")
            alias = _normalize(alias)
            if alias:
                aliases.append(alias)
        for locale in ("pl", "en"):
            name = prod.get("names", {}).get(locale)
            if not name:
                continue
            name_norm = _normalize(name)
            tokens = set(name_norm.split())
            for al in aliases:
                tokens.update(al.split())
            strings = [name_norm] + aliases
            _INDEX[locale].append(
                {"id": prod.get("id"), "tokens": tokens, "strings": strings}
            )


def search_products(query: str, locale: str) -> List[Dict[str, object]]:
    """Search products returning list of {productId, score}."""
    if locale not in _INDEX:
        raise ValueError("locale must be 'pl' or 'en'")
    norm_query = _normalize(query)
    if not norm_query:
        return []
    results: List[Dict[str, object]] = []
    for item in _INDEX[locale]:
        score = 0
        # Prefix match: any string starts with query
        if any(s.startswith(norm_query) for s in item["strings"]):
            score = 3
        # Token match: query equals any token
        elif norm_query in item["tokens"]:
            score = 2
        # Substring match: query substring of any string
        elif any(norm_query in s for s in item["strings"]):
            score = 1
        if score:
            results.append({"productId": item["id"], "score": score})
    results.sort(key=lambda r: (-r["score"], r["productId"]))
    return results
