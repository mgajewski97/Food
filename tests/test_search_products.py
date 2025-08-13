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
    token = _find(search_products("nuts", "en"), "prod.cashew-nuts")
    substr = _find(search_products("she", "en"), "prod.cashew-nuts")
    assert prefix["score"] > token["score"] > substr["score"]
