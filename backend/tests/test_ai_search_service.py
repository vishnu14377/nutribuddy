"""Unit tests for the nutritional filter/ranking logic and explanation generator.

These cover the exact behavior the team originally reported as broken:
'high protein low carb' queries must never rank carb-heavy items above
protein-dominant ones, and calorie limits must be respected.
"""

import pytest

from services.ai_search_service import EnhancedAISearchService, ExplanationService
from models.recipe import Recipe


@pytest.fixture
def search_service():
    # __init__ only stores references; no network calls are made.
    return EnhancedAISearchService(vector_service=None, db_service=None)


def make_result(name, protein=0, carbs=0, calories=0, fat=0, score=0.9, id=None):
    return {
        'id': id or name,
        'score': score,
        'metadata': {
            'name': name,
            'protein': protein,
            'carbs': carbs,
            'calories': calories,
            'fat': fat,
        },
    }


# ── Calorie limit extraction ─────────────────────────────────────────────────

class TestExtractCalorieLimit:
    @pytest.mark.parametrize('query,expected', [
        ('under 500 cal', 500),
        ('under 500 calories', 500),
        ('below 300 cal', 300),
        ('less than 400 calories', 400),
        ('max 600 cal', 600),
        ('700 cal or less', 700),
        ('< 450 cal', 450),
        ('under 350', 350),
        ('below 250', 250),
    ])
    def test_extracts_explicit_limits(self, search_service, query, expected):
        assert search_service._extract_calorie_limit(query) == expected

    @pytest.mark.parametrize('query', ['low cal lunch', 'light dinner', 'diet friendly', 'healthy bowl'])
    def test_general_low_calorie_intent_defaults_to_500(self, search_service, query):
        assert search_service._extract_calorie_limit(query) == 500

    @pytest.mark.parametrize('query', ['high protein meal', 'spicy chicken', 'pizza'])
    def test_no_limit_returns_none(self, search_service, query):
        assert search_service._extract_calorie_limit(query) is None


# ── Nutritional filters ──────────────────────────────────────────────────────

class TestProteinLowCarbFilter:
    def test_strict_filter_drops_carb_dominant_items(self, search_service):
        results = [
            make_result('Pasta', protein=20, carbs=80),
            make_result('Grilled Chicken', protein=45, carbs=10),
            make_result('Burrito', protein=30, carbs=60),
            make_result('Steak', protein=50, carbs=5),
        ]
        out = search_service._apply_nutritional_filters('high protein low carb', results)
        names = [r['metadata']['name'] for r in out]
        assert 'Pasta' not in names
        assert 'Burrito' not in names
        assert set(names) == {'Grilled Chicken', 'Steak'}

    def test_survivors_sorted_by_protein_carb_ratio(self, search_service):
        results = [
            make_result('Chicken', protein=40, carbs=20),   # ratio 2
            make_result('Steak', protein=50, carbs=5),      # ratio 10
            make_result('Fish', protein=30, carbs=6),       # ratio 5
        ]
        out = search_service._apply_nutritional_filters('high protein low carb', results)
        assert [r['metadata']['name'] for r in out] == ['Steak', 'Fish', 'Chicken']

    def test_fallback_to_best_ratios_when_nothing_passes(self, search_service):
        results = [
            make_result('Pasta', protein=20, carbs=80),
            make_result('Rice Bowl', protein=15, carbs=90),
        ]
        out = search_service._apply_nutritional_filters('high protein low carb', results)
        assert len(out) == 2
        assert out[0]['metadata']['name'] == 'Pasta'  # 0.25 > 0.17

    def test_keto_triggers_low_carb_path(self, search_service):
        results = [
            make_result('Keto Plate', protein=40, carbs=8),
            make_result('Sandwich', protein=25, carbs=45),
        ]
        out = search_service._apply_nutritional_filters('keto dinner', results)
        assert out[0]['metadata']['name'] == 'Keto Plate'
        assert all(r['metadata']['carbs'] < 30 for r in out) or len(out) <= 15

    def test_zero_carbs_does_not_divide_by_zero(self, search_service):
        results = [
            make_result('Plain Chicken', protein=40, carbs=0),
            make_result('Eggs', protein=18, carbs=1),
        ]
        out = search_service._apply_nutritional_filters('high protein low carb', results)
        assert out[0]['metadata']['name'] == 'Plain Chicken'


class TestProteinOnlyFilter:
    def test_sorted_by_protein_descending(self, search_service):
        results = [
            make_result('Salad', protein=8),
            make_result('Steak', protein=50),
            make_result('Chicken', protein=35),
        ]
        out = search_service._apply_nutritional_filters('high protein', results)
        assert [r['metadata']['name'] for r in out] == ['Steak', 'Chicken', 'Salad']

    def test_none_protein_treated_as_zero(self, search_service):
        results = [
            make_result('Mystery', protein=None),
            make_result('Chicken', protein=35),
        ]
        out = search_service._apply_nutritional_filters('protein rich', results)
        assert out[0]['metadata']['name'] == 'Chicken'


class TestLowCarbOnlyFilter:
    def test_filters_under_30g_and_sorts_ascending(self, search_service):
        results = [
            make_result('Wrap', carbs=45),
            make_result('Omelette', carbs=5),
            make_result('Salad', carbs=15),
        ]
        out = search_service._apply_nutritional_filters('low carb', results)
        assert [r['metadata']['name'] for r in out] == ['Omelette', 'Salad']

    def test_fallback_when_nothing_under_30(self, search_service):
        results = [
            make_result('Pasta', carbs=80),
            make_result('Wrap', carbs=45),
        ]
        out = search_service._apply_nutritional_filters('low carb', results)
        assert [r['metadata']['name'] for r in out] == ['Wrap', 'Pasta']


class TestCalorieFilter:
    def test_filters_over_limit_and_sorts_ascending(self, search_service):
        results = [
            make_result('Burger', calories=890),
            make_result('Salad', calories=280),
            make_result('Bowl', calories=480),
        ]
        out = search_service._apply_nutritional_filters('under 500 cal', results)
        assert [r['metadata']['name'] for r in out] == ['Salad', 'Bowl']

    def test_fallback_returns_lowest_calorie_items_when_none_qualify(self, search_service):
        results = [
            make_result('Burger', calories=890),
            make_result('Pizza', calories=1200),
        ]
        out = search_service._apply_nutritional_filters('under 100 cal', results)
        assert out[0]['metadata']['name'] == 'Burger'

    def test_calorie_and_protein_filters_compose(self, search_service):
        results = [
            make_result('Lean Bowl', protein=45, carbs=20, calories=450),
            make_result('Big Steak', protein=60, carbs=10, calories=900),
            make_result('Fries', protein=5, carbs=60, calories=400),
        ]
        out = search_service._apply_nutritional_filters('high protein low carb under 500 cal', results)
        names = [r['metadata']['name'] for r in out]
        assert names[0] == 'Lean Bowl'
        assert 'Big Steak' not in names  # over calorie limit
        assert 'Fries' not in names      # carbs > protein


class TestDefaultPath:
    def test_plain_query_preserves_vector_order(self, search_service):
        results = [
            make_result('A', score=0.9),
            make_result('B', score=0.8),
        ]
        out = search_service._apply_nutritional_filters('spicy chicken pizza', results)
        assert [r['metadata']['name'] for r in out] == ['A', 'B']


# ── Explanation service ──────────────────────────────────────────────────────

class TestExplanationService:
    def test_calorie_query_mentions_calories_and_macros(self):
        recipe = Recipe(name='Salad', estimated_calories=280, estimated_protein=9, estimated_carbs=18)
        text = ExplanationService.generate_explanation('under 500 cal', recipe)
        assert '280' in text
        assert '9' in text and '18' in text

    def test_protein_carb_query_mentions_ratio_and_keto(self):
        recipe = Recipe(name='Steak', estimated_protein=50, estimated_carbs=5, estimated_calories=610)
        text = ExplanationService.generate_explanation('high protein low carb', recipe)
        assert 'ratio' in text.lower()
        assert 'keto' in text.lower()  # carbs < 15

    def test_plain_query_gives_summary_with_restaurant(self):
        recipe = Recipe(name='Bowl', estimated_calories=520, estimated_protein=48,
                        estimated_carbs=35, restaurant_name='BiteRush Kitchen')
        text = ExplanationService.generate_explanation('chicken bowl', recipe)
        assert '520' in text
        assert 'BiteRush Kitchen' in text

    def test_handles_missing_nutrition_gracefully(self):
        recipe = Recipe(name='Mystery Dish')
        text = ExplanationService.generate_explanation('high protein', recipe)
        assert isinstance(text, str) and len(text) > 0
