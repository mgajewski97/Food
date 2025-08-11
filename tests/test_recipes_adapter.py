import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app


def test_recipes_endpoint_returns_normalized_items():
    app = create_app()
    client = app.test_client()
    resp = client.get('/api/recipes?locale=en')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) > 0
    sample = data[0]
    assert 'id' in sample and 'names' in sample and 'servings' in sample
    # stable shape defaults on recipe
    assert sample['amount'] == 0
    assert sample['threshold'] == 0
    assert sample['storage'] == 'pantry'
    assert sample['flags'] is False
    assert isinstance(sample.get('ingredients'), list)
    assert sample['ingredients'], 'ingredients should not be empty'
    first_ing = sample['ingredients'][0]
    assert 'productId' in first_ing
    assert 'unitId' in first_ing
    assert 'productName' in first_ing
