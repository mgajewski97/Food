import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
import app.routes as routes
from app import create_app


def test_products_error_returns_traceid(monkeypatch):
    app = create_app()
    client = app.test_client()

    def boom():
        raise RuntimeError("boom")

    monkeypatch.setattr(routes, "_load_products_compat", boom)
    resp = client.get("/api/products")
    assert resp.status_code == 500
    assert resp.mimetype == "application/json"
    data = resp.get_json()
    assert data["error"] == "Internal Server Error"
    assert "traceId" in data and len(data["traceId"]) == 8


def test_404_returns_json_message():
    app = create_app()
    client = app.test_client()
    resp = client.get("/missing")
    assert resp.status_code == 404
    assert resp.mimetype == "application/json"
    assert resp.get_json() == {"error": "not found"}


def test_health_endpoint_returns_counts():
    app = create_app()
    client = app.test_client()
    resp = client.get("/api/_health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["schemaVersion"] == "normalized@1"
    assert isinstance(data["productsCount"], int)
    assert isinstance(data["recipesCount"], int)
    assert data["lastUpdated"]
