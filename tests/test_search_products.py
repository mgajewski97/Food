import pytest

from app.search import search_products


def _find(results, pid):
    for item in results:
        if item["productId"] == pid:
            return item
    raise AssertionError(f"product {pid} not found")


def test_diacritics_and_normalization():
    res = search_products("gozdziki", "pl")
    item = _find(res, "prod.cloves")
    assert item["score"] >= 1


def test_synonyms_across_locales():
    en = search_products("cashew", "en")
    pl = search_products("nerkowca", "pl")
    assert en[0]["productId"] == "prod.cashew-nuts"
    assert pl[0]["productId"] == en[0]["productId"]


def test_ranking_scores():
    prefix = _find(search_products("cashew", "en"), "prod.cashew-nuts")
    contains = _find(search_products("she", "en"), "prod.cashew-nuts")
    fuzzy = _find(search_products("cashew nts", "en"), "prod.cashew-nuts")
    assert prefix["score"] > contains["score"] > fuzzy["score"]


def test_fuzzy_rank_lower_than_contains():
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
