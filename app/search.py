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


# Map spice levels for sorting
_LEVEL_ORDER = {"high": 3, "medium": 2, "low": 1, "none": 0, None: 0}


def _distance_leq_one(a: str, b: str) -> bool:
    """Return True if edit distance between a and b is <= 1."""
    if abs(len(a) - len(b)) > 1:
        return False
    # classic DP with early exit
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        min_curr = curr[0]
        for j, cb in enumerate(b, 1):
            ins = curr[j - 1] + 1
            del_ = prev[j] + 1
            sub = prev[j - 1] + (ca != cb)
            val = min(ins, del_, sub)
            curr.append(val)
            if val < min_curr:
                min_curr = val
        if min_curr > 1:
            return False
        prev = curr
    return prev[-1] <= 1


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
                {
                    "id": prod.get("id"),
                    "tokens": tokens,
                    "strings": strings,
                    "name": name_norm,
                }
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
        best = 0
        matched_name = False
        for idx, s in enumerate(item["strings"]):
            score = 0
            if s.startswith(norm_query):
                score = 3
            elif norm_query in s:
                score = 2
            elif _distance_leq_one(norm_query, s):
                score = 1
            if score > best or (score == best and idx == 0 and not matched_name):
                best = score
                matched_name = idx == 0
        if best:
            results.append(
                {
                    "productId": item["id"],
                    "score": best,
                    "is_name": matched_name,
                    "owned": item.get("owned", 0),
                    "level": item.get("level"),
                    "name": item.get("name", ""),
                }
            )
    results.sort(
        key=lambda r: (
            -r["score"],
            -int(r["is_name"]),
            -float(r.get("owned", 0)),
            -_LEVEL_ORDER.get(r.get("level"), 0),
            r.get("name", ""),
            r["productId"],
        )
    )
    return [{"productId": r["productId"], "score": r["score"]} for r in results]
