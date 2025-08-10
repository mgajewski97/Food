import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app


def test_recipes_endpoint_returns_mapped_items():
    app = create_app()
    client = app.test_client()
    resp = client.get('/api/recipes')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any(len(r.get('ingredients', [])) >= 1 for r in data)
