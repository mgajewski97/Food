import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app


def test_domain_endpoint_returns_data():
    app = create_app()
    client = app.test_client()
    resp = client.get("/api/domain")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    assert "products" in data and "categories" in data and "units" in data
    assert len(data["products"]) > 0
