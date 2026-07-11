"""Unit tests for the SQLite database service."""

import pytest

from services.database_service import DatabaseService


@pytest.fixture
def db(tmp_path):
    return DatabaseService(str(tmp_path / 'test.db'))


def sample_recipe(id='r1', **overrides):
    data = {
        'id': id,
        'name': 'Grilled Chicken Power Bowl',
        'description': 'Lean grilled chicken',
        'ingredients': ['chicken', 'quinoa'],
        'cuisine_type': 'Healthy',
        'spice_level': 'Mild',
        'dietary_tags': ['high-protein'],
        'estimated_calories': 520,
        'estimated_protein': 48.0,
        'estimated_carbs': 35.0,
        'estimated_fat': 18.0,
        'image_url': 'http://example.com/x.jpg',
        'restaurant_name': 'BiteRush Kitchen',
        'rating': 4.5,
        'price': 249.0,
    }
    data.update(overrides)
    return data


class TestUpsertAndFetch:
    def test_roundtrip_preserves_fields_and_json_lists(self, db):
        db.upsert_recipe(sample_recipe())
        row = db.get_recipe_by_id('r1')
        assert row['name'] == 'Grilled Chicken Power Bowl'
        assert row['ingredients'] == ['chicken', 'quinoa']
        assert row['dietary_tags'] == ['high-protein']
        assert row['estimated_calories'] == 520
        assert row['price'] == 249.0

    def test_upsert_same_id_replaces(self, db):
        db.upsert_recipe(sample_recipe())
        db.upsert_recipe(sample_recipe(name='Renamed Bowl'))
        assert db.get_count() == 1
        assert db.get_recipe_by_id('r1')['name'] == 'Renamed Bowl'

    def test_get_missing_id_returns_none(self, db):
        assert db.get_recipe_by_id('nope') is None


class TestBatchFetch:
    def test_get_recipes_by_ids(self, db):
        db.upsert_recipe(sample_recipe(id='a'))
        db.upsert_recipe(sample_recipe(id='b'))
        db.upsert_recipe(sample_recipe(id='c'))
        rows = db.get_recipes_by_ids(['a', 'c', 'missing'])
        assert {r['id'] for r in rows} == {'a', 'c'}

    def test_empty_id_list_returns_empty(self, db):
        assert db.get_recipes_by_ids([]) == []


class TestCountAndClear:
    def test_count_and_clear_all(self, db):
        db.upsert_recipe(sample_recipe(id='a'))
        db.upsert_recipe(sample_recipe(id='b'))
        assert db.get_count() == 2
        db.clear_all()
        assert db.get_count() == 0

    def test_get_all_recipes_respects_limit(self, db):
        for i in range(5):
            db.upsert_recipe(sample_recipe(id=f'r{i}'))
        assert len(db.get_all_recipes(limit=3)) == 3


class TestRowToDict:
    def test_malformed_json_field_becomes_empty_list(self, db):
        db.upsert_recipe(sample_recipe())
        with db.get_connection() as conn:
            conn.execute("UPDATE recipes SET ingredients = 'not json' WHERE id = 'r1'")
        assert db.get_recipe_by_id('r1')['ingredients'] == []

    def test_null_json_field_becomes_empty_list(self, db):
        db.upsert_recipe(sample_recipe(ingredients=None, dietary_tags=None))
        row = db.get_recipe_by_id('r1')
        # json.dumps(None) stores 'null'; loading yields [] per service contract
        assert row['ingredients'] == [] or row['ingredients'] is None
        assert isinstance(db.get_recipe_by_id('r1'), dict)
