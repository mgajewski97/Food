import pytest

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import search as search_mod
from app.search import search_products


def _find(results, pid):
    for item in results:
        if item["productId"] == pid:
            return item
    raise AssertionError(f"product {pid} not found")


def _set_index(monkeypatch):
    products = [
        {
            "id": "prod.cloves",
            "names": {"pl": "Goździki", "en": "Cloves"},
            "aliases": [],
        },
        {
            "id": "prod.cashew-nuts",
            "names": {"pl": "Orzechy nerkowca", "en": "Cashew nuts"},
            "aliases": [],
        },
    ]
    idx = {"pl": [], "en": []}
    for prod in products:
        for loc, name in prod["names"].items():
            norm = search_mod._normalize(name)
            tokens = set(norm.split())
            idx[loc].append(
                {
                    "id": prod["id"],
                    "tokens": tokens,
                    "strings": [norm],
                    "name": norm,
                    "owned": 0,
                    "level": None,
                }
            )
    monkeypatch.setattr(search_mod, "_INDEX", idx)


def test_diacritics_and_normalization(monkeypatch):
    _set_index(monkeypatch)
    res = search_products("gozdziki", "pl")
    item = _find(res, "prod.cloves")
    assert item["score"] >= 1


def test_synonyms_across_locales(monkeypatch):
    _set_index(monkeypatch)
    en = search_products("cashew", "en")
    pl = search_products("nerkowca", "pl")
    assert en[0]["productId"] == "prod.cashew-nuts"
    assert pl[0]["productId"] == en[0]["productId"]


def test_ranking_scores(monkeypatch):
    _set_index(monkeypatch)
    prefix = _find(search_products("cashew", "en"), "prod.cashew-nuts")
    contains = _find(search_products("she", "en"), "prod.cashew-nuts")
    fuzzy = _find(search_products("cashew nts", "en"), "prod.cashew-nuts")
    assert prefix["score"] > contains["score"] > fuzzy["score"]


def test_fuzzy_rank_lower_than_contains(monkeypatch):
    _set_index(monkeypatch)
    contains = _find(search_products("she", "en"), "prod.cashew-nuts")
    fuzzy = _find(search_products("cashew nts", "en"), "prod.cashew-nuts")
    assert contains["score"] > fuzzy["score"]


def test_name_over_alias(monkeypatch):
    from app import search as search_mod

    custom = {
        "en": [
            {
                "id": "prod.name",
                "tokens": {"alpha"},
                "strings": ["alpha"],
                "name": "alpha",
            },
            {
                "id": "prod.alias",
                "tokens": {"alpha"},
                "strings": ["beta", "alpha"],
                "name": "beta",
            },
        ],
        "pl": [],
    }
    monkeypatch.setattr(search_mod, "_INDEX", custom)
    res = search_products("alpha", "en")
    assert [r["productId"] for r in res] == ["prod.name", "prod.alias"]
