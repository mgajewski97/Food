
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

import app.routes as routes
from app import create_app


def _setup_paths(tmp_path, monkeypatch):
    prod = tmp_path / "products.json"
    rec = tmp_path / "recipes.json"
    shop = tmp_path / "shopping.json"
    prod.write_text("[]")
    rec.write_text("[]")
    monkeypatch.setattr(routes, "PRODUCTS_PATH", str(prod))
    monkeypatch.setattr(routes, "RECIPES_PATH", str(rec))
    monkeypatch.setattr(routes, "SHOPPING_PATH", str(shop))


def test_shopping_invalid_payload_returns_400(tmp_path, monkeypatch):
    _setup_paths(tmp_path, monkeypatch)
    app = create_app()
    client = app.test_client()

    resp = client.post("/api/shopping", json={"wrong": []})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "traceId" in data and len(data["traceId"]) == 8


def test_shopping_mark_invalid_payload_returns_400(tmp_path, monkeypatch):
    _setup_paths(tmp_path, monkeypatch)
    app = create_app()
    client = app.test_client()

    resp = client.patch("/api/shopping/prod.x", json={"inCart": "yes"})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "traceId" in data and len(data["traceId"]) == 8
