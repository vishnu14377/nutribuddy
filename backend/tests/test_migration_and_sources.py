"""Tests for schema migration and per-source data operations."""

import sqlite3

import pytest

from services.database_service import DatabaseService


LEGACY_SCHEMA = '''
    CREATE TABLE recipes (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        ingredients TEXT,
        cuisine_type TEXT,
        spice_level TEXT,
        dietary_tags TEXT,
        estimated_calories INTEGER,
        estimated_protein REAL,
        estimated_carbs REAL,
        estimated_fat REAL,
        image_url TEXT,
        restaurant_name TEXT,
        rating REAL,
        price REAL
    )
'''


class TestMigration:
    def test_legacy_db_gains_new_columns_and_keeps_data(self, tmp_path):
        db_path = str(tmp_path / 'legacy.db')
        conn = sqlite3.connect(db_path)
        conn.execute(LEGACY_SCHEMA)
        conn.execute(
            "INSERT INTO recipes (id, name, ingredients, dietary_tags, price) "
            "VALUES ('old1', 'Legacy Dish', '[]', '[]', 249.0)"
        )
        conn.commit()
        conn.close()

        db = DatabaseService(db_path)
        row = db.get_recipe_by_id('old1')
        assert row['name'] == 'Legacy Dish'
        assert row['price'] == 249.0
        # Migration default: pre-platform rows belong to the biterush partner
        assert row['source_platform'] == 'biterush'
        assert row['currency'] is None
        assert 'order_url' in row and 'uber_uuid' in row

    def test_migration_is_idempotent(self, tmp_path):
        db_path = str(tmp_path / 'fresh.db')
        DatabaseService(db_path)
        db = DatabaseService(db_path)  # second init must not raise
        assert db.get_count() == 0

    def test_all_recipe_fields_roundtrip(self, tmp_path):
        from models.recipe import Recipe
        db = DatabaseService(str(tmp_path / 't.db'))
        recipe = Recipe(
            id='full1', name='Full Dish', description='desc',
            ingredients=['a', 'b'], cooking_method='grilled', cuisine_type='Test',
            cooking_time='20m', spice_level='Hot', dietary_tags=['keto-friendly'],
            estimated_calories=500, estimated_protein=40.0, estimated_carbs=10.0,
            estimated_fat=30.0, image_url='http://x', restaurant_name='R',
            delivery_time='30m', rating=4.2, price=12.99, currency='USD',
            source_platform='ubereats', order_url='https://example.com/x',
            uber_uuid='u-1', tags='t',
            latitude=38.9072, longitude=-77.0369, postal_code='20009',
        )
        db.upsert_recipe(recipe.model_dump())
        row = db.get_recipe_by_id('full1')
        restored = Recipe(**row)
        assert restored == recipe  # nothing silently dropped


class TestPerSourceOperations:
    @pytest.fixture
    def db(self, tmp_path):
        db = DatabaseService(str(tmp_path / 't.db'))
        for i in range(3):
            db.upsert_recipe({'id': f'u{i}', 'name': f'Uber {i}', 'source_platform': 'ubereats'})
        for i in range(2):
            db.upsert_recipe({'id': f'd{i}', 'name': f'Dash {i}', 'source_platform': 'doordash'})
        return db

    def test_get_ids_by_source(self, db):
        assert sorted(db.get_ids_by_source('ubereats')) == ['u0', 'u1', 'u2']
        assert sorted(db.get_ids_by_source('doordash')) == ['d0', 'd1']
        assert db.get_ids_by_source('grubhub') == []

    def test_clear_source_leaves_other_platforms(self, db):
        removed = db.clear_source('ubereats')
        assert removed == 3
        assert db.get_count() == 2
        assert sorted(db.get_ids_by_source('doordash')) == ['d0', 'd1']

    def test_platform_counts(self, db):
        assert db.get_platform_counts() == {'ubereats': 3, 'doordash': 2}
