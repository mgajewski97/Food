
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
    products = data.get('products', [])
    assert isinstance(products, list)
    assert len(products) > 0
    first = products[0]
    assert 'id' in first and 'names' in first
