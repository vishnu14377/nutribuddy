"""Unit tests for the pure (no-network) parts of VectorService."""

from models.recipe import Recipe
from services.vector_service import VectorService


def make_recipe(**overrides):
    data = {
        'name': 'Keto Steak & Eggs',
        'restaurant_name': 'BiteRush Kitchen',
        'cuisine_type': 'American',
        'description': 'Ribeye with fried eggs',
        'estimated_calories': 610,
        'estimated_protein': 52.0,
        'estimated_carbs': 4.0,
        'estimated_fat': 42.0,
        'dietary_tags': ['keto-friendly', 'high-protein'],
        'spice_level': 'Mild',
        'price': 349.0,
    }
    data.update(overrides)
    return Recipe(**data)


class TestSearchableText:
    def test_includes_core_fields(self):
        text = VectorService.create_searchable_text(None, make_recipe())
        assert 'Keto Steak & Eggs' in text
        assert 'BiteRush Kitchen' in text
        assert '610' in text

    def test_high_protein_marker_above_25g(self):
        text = VectorService.create_searchable_text(None, make_recipe(estimated_protein=30.0))
        assert 'high protein' in text

    def test_low_carb_keto_marker_below_20g(self):
        text = VectorService.create_searchable_text(None, make_recipe(estimated_carbs=10.0))
        assert 'low carb' in text
        assert 'keto friendly' in text

    def test_handles_all_optional_fields_missing(self):
        text = VectorService.create_searchable_text(None, Recipe(name='Plain Dish'))
        assert 'Plain Dish' in text


class TestMetadata:
    def test_metadata_fields_and_truncation(self):
        recipe = make_recipe(name='X' * 300, restaurant_name='Y' * 200)
        meta = VectorService._build_metadata(None, recipe)
        assert len(meta['name']) == 200
        assert len(meta['restaurant']) == 100
        assert meta['calories'] == 610
        assert meta['protein'] == 52.0

    def test_none_values_default_to_zero_or_empty(self):
        meta = VectorService._build_metadata(None, Recipe(name='Plain'))
        assert meta['calories'] == 0
        assert meta['restaurant'] == ''
        assert meta['dietary_tags'] == ''
