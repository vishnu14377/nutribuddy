"""Unit tests for query-intent parsing, constraint filtering, and explanations.

These encode the customer-evaluation round-1 punch list: constraints are
filters over relevance order (never replacement sorts), misses are never
silent, and phrasing variants all parse.
"""

import pytest

from services.ai_search_service import (
    EnhancedAISearchService,
    ExplanationService,
    QueryIntent,
    parse_intent,
    RELEVANCE_FLOOR,
)
from models.recipe import Recipe


# ── Intent parsing ───────────────────────────────────────────────────────────

class TestCalorieParsing:
    @pytest.mark.parametrize('query,expected', [
        ('under 500 cal', 500),
        ('under 500 calories', 500),
        ('below 300 cal', 300),
        ('less than 400 calories', 400),
        ('max 600 cal', 600),
        ('700 cal or less', 700),
        ('700 calories or less', 700),   # round-1 fix: full word
        ('< 450 cal', 450),
        ('under 350', 350),
        ('300 calorie lunch', 300),      # round-1 fix: natural phrasing
        ('a 450 calorie dinner', 450),
    ])
    def test_extracts_explicit_limits(self, query, expected):
        assert parse_intent(query).calorie_limit == expected

    @pytest.mark.parametrize('query', ['low cal lunch', 'light dinner', 'diet friendly', 'healthy bowl'])
    def test_general_low_calorie_intent_defaults_to_500(self, query):
        assert parse_intent(query).calorie_limit == 500

    def test_under_zero_is_impossible(self):
        assert parse_intent('under 0 calories').impossible is True

    def test_no_limit(self):
        intent = parse_intent('spicy chicken pizza')
        assert intent.calorie_limit is None
        assert not intent.has_any_constraint()


class TestMacroAndPriceParsing:
    def test_gram_level_carb_limit(self):
        assert parse_intent('keto lunch under 15g carbs').max_carbs == 15

    def test_gram_level_protein_target(self):
        assert parse_intent('40g protein meal').min_protein == 40

    def test_dollar_budget_is_not_calories(self):
        intent = parse_intent('40g protein under 12 dollars')
        assert intent.price_limit == 12
        assert intent.min_protein == 40
        assert intent.calorie_limit is None   # round-1 fix: $12 must not become a calorie cap

    def test_dollar_sign_budget(self):
        assert parse_intent('lunch under $15').price_limit == 15

    def test_keto_sets_strict_carb_gate(self):
        assert parse_intent('keto dinner').max_carbs == 15

    def test_low_carb_sets_loose_gate(self):
        assert parse_intent('low carb dinner').max_carbs == 30

    def test_bunless_implies_carb_constraint(self):
        assert parse_intent('bunless burger').max_carbs == 20

    def test_high_protein_default_threshold(self):
        assert parse_intent('high protein meal').min_protein == 30

    def test_typo_protien_still_parses(self):
        assert parse_intent('hi protien lo carb dinner').min_protein == 30
        assert parse_intent('hi protien lo carb dinner').max_carbs == 30

    def test_spanish_low_carb(self):
        intent = parse_intent('comida alta en proteinas y baja en carbohidratos')
        assert intent.min_protein == 30
        assert intent.max_carbs == 30


class TestDietaryParsing:
    def test_vegetarian(self):
        assert parse_intent('vegetarian high protein').vegetarian is True

    def test_vegan_implies_vegetarian(self):
        intent = parse_intent('vegan bowl')
        assert intent.vegan is True and intent.vegetarian is True

    def test_no_meat(self):
        assert parse_intent('dinner with no meat').vegetarian is True


# ── Constraint filtering (via _passes) ───────────────────────────────────────

def make_candidate(name, protein=0, carbs=0, calories=0, fat=0, price=0,
                   currency='USD', tags='', score=0.5, id=None):
    return {
        'id': id or name,
        'score': score,
        'metadata': {
            'name': name, 'protein': protein, 'carbs': carbs,
            'calories': calories, 'fat': fat, 'price': price,
            'currency': currency, 'dietary_tags': tags,
        },
    }


@pytest.fixture
def svc():
    return EnhancedAISearchService(vector_service=None, db_service=None)


class TestPasses:
    def test_calorie_limit_is_strict(self, svc):
        intent = QueryIntent(calorie_limit=400)
        assert svc._passes(make_candidate('A', calories=399), intent)
        assert not svc._passes(make_candidate('B', calories=400), intent)  # 'under' = strict <

    def test_carb_and_protein_limits(self, svc):
        intent = QueryIntent(max_carbs=15, min_protein=30)
        assert svc._passes(make_candidate('Keto', protein=45, carbs=10), intent)
        assert not svc._passes(make_candidate('Salad', protein=45, carbs=18), intent)
        assert not svc._passes(make_candidate('Weak', protein=20, carbs=5), intent)

    def test_multi_serving_excluded_from_nutrition_queries(self, svc):
        intent = QueryIntent(min_protein=30)
        deal = make_candidate('Family Meal Deal', protein=120, calories=3200)
        assert not svc._passes(deal, intent)
        big = make_candidate('Catering Tray', protein=100, calories=2800)
        assert not svc._passes(big, intent)  # calorie ceiling

    def test_vegetarian_requires_tag_or_meatless_name(self, svc):
        intent = QueryIntent(vegetarian=True)
        assert svc._passes(make_candidate('Paneer Tikka', tags='vegetarian'), intent)
        assert svc._passes(make_candidate('Garden Salad'), intent)  # no meat word
        assert not svc._passes(make_candidate('Chicken Bowl'), intent)
        assert not svc._passes(make_candidate('Lamb Kofta', tags='high-protein'), intent)

    def test_vegan_requires_tag(self, svc):
        intent = QueryIntent(vegan=True, vegetarian=True)
        assert svc._passes(make_candidate('Tofu Bowl', tags='vegan'), intent)
        assert not svc._passes(make_candidate('Paneer Tikka', tags='vegetarian'), intent)

    def test_price_limit_only_compares_usd(self, svc):
        intent = QueryIntent(price_limit=12)
        assert svc._passes(make_candidate('Cheap', price=9.99, currency='USD'), intent)
        assert not svc._passes(make_candidate('Pricey', price=14.5, currency='USD'), intent)
        assert not svc._passes(make_candidate('Unknown', price=9.99, currency=''), intent)


# ── Search-level behavior with fakes ─────────────────────────────────────────

class FakeVectors:
    def __init__(self, candidates):
        self.candidates = candidates

    def search(self, query, top_k=20, filters=None):
        return self.candidates[:top_k]


class FakeDB:
    """Round-trips the candidates' nutrition into recipe rows, like the real DB."""

    def __init__(self, candidates):
        self.rows = {}
        for c in candidates:
            md = c['metadata']
            self.rows[c['id']] = {
                'id': c['id'], 'name': md['name'], 'ingredients': [], 'dietary_tags': [],
                'estimated_calories': md['calories'] or None,
                'estimated_protein': md['protein'] or None,
                'estimated_carbs': md['carbs'] or None,
                'estimated_fat': md['fat'] or None,
                'price': md['price'] or None,
                'currency': md['currency'] or None,
            }

    def get_recipes_by_ids(self, ids):
        return [self.rows[i] for i in ids if i in self.rows]


def run_search(candidates, query):
    svc = EnhancedAISearchService(FakeVectors(candidates), FakeDB(candidates))
    return svc.search(query)


class TestSearchBehavior:
    def test_results_ordered_by_score_not_by_macro(self):
        candidates = [
            make_candidate('LowCarbWeakMatch', protein=40, carbs=2, score=0.30),
            make_candidate('KetoStrongMatch', protein=45, carbs=8, score=0.60),
        ]
        results = run_search(candidates, 'keto dinner')
        # Both qualify; the STRONGER semantic match ranks first (round-1 fix:
        # no more carbs-ascending re-sort burying the best match)
        assert results[0]['recipe'].name == 'KetoStrongMatch'
        assert all(r['meets_constraints'] for r in results)

    def test_fallback_flags_unmet_constraints(self):
        candidates = [
            make_candidate('Bowl', calories=380, protein=30, score=0.5),
            make_candidate('Burger', calories=640, protein=40, score=0.6),
        ]
        results = run_search(candidates, 'meal under 100 calories')
        assert results, 'fallback should return closest options'
        assert all(r['meets_constraints'] is False for r in results)
        assert 'Closest option' in results[0]['match_explanation']
        # closest by the binding constraint (lowest calories first among fallback)
        assert results[0]['recipe'].name in ('Bowl', 'Burger')

    def test_impossible_limit_returns_empty(self):
        candidates = [make_candidate('Burger', calories=640, score=0.6)]
        assert run_search(candidates, 'under 0 calories') == []

    def test_vegetarian_never_falls_back_to_meat(self):
        candidates = [
            make_candidate('Chicken Bowl', protein=45, score=0.6),
            make_candidate('Lamb Kofta', protein=40, score=0.5),
        ]
        assert run_search(candidates, 'vegetarian high protein') == []

    def test_relevance_floor_gives_honest_empty(self):
        candidates = [
            make_candidate('Pizza A', score=0.18),
            make_candidate('Pizza B', score=0.16),
        ]
        assert run_search(candidates, 'asdfghjkl zzz') == []
        assert RELEVANCE_FLOOR > 0.18

    def test_unconstrained_query_passes_through_by_score(self):
        candidates = [
            make_candidate('A', score=0.55),
            make_candidate('B', score=0.45),
        ]
        results = run_search(candidates, 'tasty pizza')
        assert [r['recipe'].name for r in results] == ['A', 'B']

    def test_dollar_budget_filters_price(self):
        candidates = [
            make_candidate('Cheap Protein', protein=42, price=11.5, score=0.5),
            make_candidate('Pricey Protein', protein=50, price=14.5, score=0.6),
        ]
        results = run_search(candidates, '40g protein under 12 dollars')
        names = [r['recipe'].name for r in results]
        assert names == ['Cheap Protein']


# ── Explanations ─────────────────────────────────────────────────────────────

class TestExplanationService:
    def test_calorie_query_mentions_calories_and_macros(self):
        recipe = Recipe(name='Salad', estimated_calories=280, estimated_protein=9, estimated_carbs=18)
        text = ExplanationService.generate_explanation('under 500 cal', recipe)
        assert '280' in text and '9' in text and '18' in text

    def test_protein_carb_query_mentions_ratio_and_keto(self):
        recipe = Recipe(name='Steak', estimated_protein=50, estimated_carbs=5, estimated_calories=610)
        text = ExplanationService.generate_explanation('high protein low carb', recipe)
        assert 'ratio' in text.lower()
        assert 'keto' in text.lower()

    def test_only_phrasing_is_earned_not_automatic(self):
        # Round-1 fix: 28g carbs must never read as "only 28g carbs"
        recipe = Recipe(name='Pizza', estimated_protein=14, estimated_carbs=28, estimated_calories=520)
        text = ExplanationService.generate_explanation('keto pizza', recipe)
        assert 'only' not in text.lower()
        assert 'keto-friendly' not in text.lower()

    def test_fallback_explanation_discloses_the_miss(self):
        recipe = Recipe(name='Bowl', estimated_calories=380, estimated_protein=30, estimated_carbs=20)
        intent = parse_intent('meal under 100 calories')
        text = ExplanationService.generate_explanation(
            'meal under 100 calories', recipe, intent=intent, meets_constraints=False)
        assert 'over your 100 cal limit' in text
        assert 'only' not in text.lower()

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
