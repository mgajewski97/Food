import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app


def test_products_endpoint_returns_mapped_items():
    app = create_app()
    client = app.test_client()
    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) > 0
    first = data[0]
    # ensure legacy fields exist
    assert "id" in first and "name_pl" in first and "unit" in first
    # stable shape defaults
    assert first["amount"] == 0
    assert first["threshold"] == 0
    assert first["storage"] == "pantry"
    assert first["flags"] is False
