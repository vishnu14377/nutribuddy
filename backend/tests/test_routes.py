"""API-level tests with a fake vector service (no network)."""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from models.recipe import Recipe
from routes.recipe_routes import create_recipe_router
from services.database_service import DatabaseService


class FakeVectorService:
    """In-memory stand-in for VectorService: records calls, no network."""

    def __init__(self):
        self.vectors = {}

    def store_recipes_batch(self, recipes, batch_size=50):
        for r in recipes:
            self.vectors[r.id] = {'platform': r.source_platform}
        return len(recipes)

    def delete_by_ids(self, ids):
        for i in ids:
            self.vectors.pop(i, None)

    def clear_index(self):
        self.vectors = {}

    def get_index_stats(self):
        return {'index_name': 'fake', 'dimension': 1536,
                'total_vectors': len(self.vectors), 'index_fullness': 0.0}

    def search(self, query, top_k=20, filters=None):
        return []


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv('ADMIN_API_TOKEN', raising=False)
    db = DatabaseService(str(tmp_path / 't.db'))
    vs = FakeVectorService()
    app = FastAPI()
    app.include_router(create_recipe_router(db, vs, openai_api_key=None, default_currency='USD'))
    c = TestClient(app)
    c.db = db
    c.vs = vs
    return c


def item(name, platform, price=9.99, currency=None, **kw):
    return {
        'name': name, 'source_platform': platform, 'price': price,
        'currency': currency, 'estimated_calories': 500,
        'estimated_protein': 30.0, 'estimated_carbs': 20.0, 'estimated_fat': 20.0,
        'restaurant_name': 'Test Kitchen', **kw,
    }


class TestIngestItems:
    def test_ingest_and_stats(self, client):
        r = client.post('/api/ingest/items', json=[item('A', 'ubereats'), item('B', 'doordash')])
        assert r.status_code == 200
        stats = client.get('/api/stats').json()
        assert stats['database']['count'] == 2
        assert stats['database']['platforms'] == {'ubereats': 1, 'doordash': 1}

    def test_per_source_replace_preserves_other_platforms(self, client):
        client.post('/api/ingest/items', json=[item('A', 'ubereats'), item('B', 'doordash')])
        # Re-ingest ONLY ubereats with new items
        r = client.post('/api/ingest/items', json=[item('A2', 'ubereats')])
        assert r.status_code == 200
        counts = client.db.get_platform_counts()
        assert counts == {'ubereats': 1, 'doordash': 1}
        names = {rec['name'] for rec in client.db.get_all_recipes()}
        assert names == {'A2', 'B'}
        # Vector store mirrors the DB
        assert len(client.vs.vectors) == 2

    def test_replace_false_appends(self, client):
        client.post('/api/ingest/items', json=[item('A', 'ubereats')])
        client.post('/api/ingest/items?replace=false', json=[item('B', 'ubereats')])
        assert client.db.get_platform_counts() == {'ubereats': 2}

    def test_currency_defaulting(self, client):
        client.post('/api/ingest/items', json=[
            item('NoCur', 'ubereats', currency=None),
            item('HasCur', 'ubereats', currency='INR'),
        ])
        by_name = {r['name']: r for r in client.db.get_all_recipes()}
        assert by_name['NoCur']['currency'] == 'USD'   # env default applied
        assert by_name['HasCur']['currency'] == 'INR'  # explicit wins

    def test_invalid_currency_rejected(self, client):
        r = client.post('/api/ingest/items', json=[item('Bad', 'ubereats', currency='DOLLARS')])
        assert r.status_code == 422

    def test_empty_payload_rejected(self, client):
        assert client.post('/api/ingest/items', json=[]).status_code == 400


class TestAdminGuard:
    def test_guard_blocks_without_token(self, tmp_path, monkeypatch):
        monkeypatch.setenv('ADMIN_API_TOKEN', 'sekret')
        db = DatabaseService(str(tmp_path / 't.db'))
        app = FastAPI()
        app.include_router(create_recipe_router(db, FakeVectorService()))
        c = TestClient(app)

        assert c.post('/api/ingest/items', json=[item('A', 'ubereats')]).status_code == 403
        assert c.delete('/api/recipes/clear').status_code == 403
        # Correct token passes
        ok = c.post('/api/ingest/items', json=[item('A', 'ubereats')],
                    headers={'X-Admin-Token': 'sekret'})
        assert ok.status_code == 200
        # Read endpoints stay open
        assert c.get('/api/recipes').status_code == 200

    def test_guard_open_when_env_unset(self, client):
        assert client.delete('/api/recipes/clear').status_code == 200


class TestSearchQueryNormalization:
    def test_platform_filter_normalized_like_ingestion(self):
        from models.recipe import SearchQuery
        assert SearchQuery(query='x', source_platform='UberEats ').source_platform == 'ubereats'
        assert SearchQuery(query='x', source_platform='  ').source_platform is None
        assert SearchQuery(query='x').source_platform is None


class TestDefaultCurrencyValidation:
    def test_invalid_default_currency_fails_at_startup(self, tmp_path):
        db = DatabaseService(str(tmp_path / 't.db'))
        with pytest.raises(ValueError, match='DEFAULT_CURRENCY'):
            create_recipe_router(db, FakeVectorService(), default_currency='$')

    def test_lowercase_default_currency_normalized(self, tmp_path, monkeypatch):
        monkeypatch.delenv('ADMIN_API_TOKEN', raising=False)
        db = DatabaseService(str(tmp_path / 't.db'))
        app = FastAPI()
        app.include_router(create_recipe_router(db, FakeVectorService(), default_currency='usd'))
        c = TestClient(app)
        c.post('/api/ingest/items', json=[item('A', 'ubereats', currency=None)])
        assert db.get_all_recipes()[0]['currency'] == 'USD'


class FailingVectorService(FakeVectorService):
    """Stores only half the batch, simulating mid-ingest embedding failure."""

    def store_recipes_batch(self, recipes, batch_size=50):
        for r in recipes[: len(recipes) // 2]:
            self.vectors[r.id] = {'platform': r.source_platform}
        return len(recipes) // 2


class TestIngestSafety:
    def test_partial_vector_failure_aborts_without_destroying_old_data(self, tmp_path, monkeypatch):
        monkeypatch.delenv('ADMIN_API_TOKEN', raising=False)
        db = DatabaseService(str(tmp_path / 't.db'))
        good_vs = FakeVectorService()
        app = FastAPI()
        app.include_router(create_recipe_router(db, good_vs))
        c = TestClient(app)
        c.post('/api/ingest/items', json=[item('Old A', 'ubereats'), item('Old B', 'ubereats')])
        old_names = {r['name'] for r in db.get_all_recipes()}

        # Swap in a failing vector service behind a fresh router on the same DB
        bad_app = FastAPI()
        bad_app.include_router(create_recipe_router(db, FailingVectorService()))
        bad_c = TestClient(bad_app)
        r = bad_c.post('/api/ingest/items?force=true', json=[item('New A', 'ubereats'), item('New B', 'ubereats')])
        assert r.status_code == 502
        # Old catalog untouched
        assert {rec['name'] for rec in db.get_all_recipes()} == old_names

    def test_small_delta_replace_requires_force(self, client):
        many = [item(f'Dish {i}', 'ubereats') for i in range(12)]
        client.post('/api/ingest/items', json=many)
        # A 2-item push with replace=true would nuke 12 items -> 409
        r = client.post('/api/ingest/items', json=[item('Delta', 'ubereats')])
        assert r.status_code == 409
        assert client.db.get_count() == 12
        # force=true is the explicit override
        r = client.post('/api/ingest/items?force=true', json=[item('Delta', 'ubereats')])
        assert r.status_code == 200
        assert client.db.get_count() == 1
        # replace=false appends without the guard
        r = client.post('/api/ingest/items?replace=false', json=[item('Delta 2', 'ubereats')])
        assert r.status_code == 200


class TestIngestUrlGuard:
    def test_disabled_without_admin_token(self, tmp_path, monkeypatch):
        monkeypatch.delenv('ADMIN_API_TOKEN', raising=False)
        db = DatabaseService(str(tmp_path / 't.db'))
        app = FastAPI()
        app.include_router(create_recipe_router(db, FakeVectorService()))
        c = TestClient(app)
        r = c.post('/api/ingest/url?url=https://example.com/menu.xlsx')
        assert r.status_code == 403
        assert 'disabled' in r.json()['detail'].lower()

    @pytest.mark.parametrize('bad_url', [
        'http://example.com/menu.xlsx',       # not https
        'https://localhost/menu.xlsx',
        'https://127.0.0.1/menu.xlsx',
        'https://10.0.0.5/menu.xlsx',
        'https://169.254.169.254/latest/meta-data',  # cloud metadata endpoint
    ])
    def test_unsafe_urls_rejected(self, tmp_path, monkeypatch, bad_url):
        monkeypatch.setenv('ADMIN_API_TOKEN', 'sekret')
        db = DatabaseService(str(tmp_path / 't.db'))
        app = FastAPI()
        app.include_router(create_recipe_router(
            db, FakeVectorService(), openai_api_key='sk-test-not-real'))
        c = TestClient(app)
        r = c.post(f'/api/ingest/url?url={bad_url}', headers={'X-Admin-Token': 'sekret'})
        assert r.status_code == 400


class TestRecipeEndpoints:
    def test_get_recipe_by_id_and_404(self, client):
        client.post('/api/ingest/items', json=[item('A', 'ubereats', id='rid1')])
        assert client.get('/api/recipes/rid1').json()['name'] == 'A'
        assert client.get('/api/recipes/nope').status_code == 404

    def test_recipes_include_new_fields(self, client):
        client.post('/api/ingest/items', json=[
            item('A', 'ubereats', order_url='https://www.ubereats.com/store/x'),
        ])
        rec = client.get('/api/recipes').json()[0]
        assert rec['source_platform'] == 'ubereats'
        assert rec['currency'] == 'USD'
        assert rec['order_url'] == 'https://www.ubereats.com/store/x'
