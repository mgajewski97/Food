
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app


def test_products_endpoint_returns_raw_data():
    app = create_app()
    client = app.test_client()
    resp = client.get('/api/products')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    assert len(data.get('products', [])) > 0
