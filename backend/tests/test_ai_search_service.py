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

    @pytest.mark.parametrize('query', ['low cal lunch', 'light dinner', 'healthy bowl'])
    def test_general_low_calorie_intent_defaults_to_500(self, query):
        assert parse_intent(query).calorie_limit == 500

    def test_diet_is_a_diet_type_word_not_a_calorie_cap(self):
        # Round-5: 'keto diet ... around 700 calories' was capped at 500
        intent = parse_intent('high protein keto diet dinner around 700 calories')
        assert intent.calorie_limit == int(700 * 1.15)
        assert parse_intent('my diet meal').calorie_limit is None

    @pytest.mark.parametrize('query', ['burger under $0', 'meal under 0g carbs', 'meal max 0g fat'])
    def test_zero_limits_are_impossible_not_crashes(self, query):
        # Round-5: these 502'd with ZeroDivisionError in the fallback path
        assert parse_intent(query).impossible is True

    def test_green_results_always_precede_amber(self):
        # Round-5: fries outranked the only true paneer match
        candidates = [
            make_candidate('French Fries', score=0.60, description='crispy fries'),
            make_candidate('Paneer Tikka Skewers', score=0.44, tags='vegetarian,high-protein',
                           protein=24, description='cottage cheese skewers', platform='biterush'),
        ]
        results = run_search(candidates, 'paneer')
        assert results[0]['recipe'].name == 'Paneer Tikka Skewers'
        assert results[0]['meets_constraints'] is True
        fries = next(r for r in results if r['recipe'].name == 'French Fries')
        assert fries['meets_constraints'] is False
        assert 'Different dish' in fries['match_explanation']

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

    def test_low_carb_is_a_real_constraint(self):
        # Round-2 fix: 28g carbs presented as a clean "low carb" match reads
        # as an ignored constraint
        assert parse_intent('low carb dinner').max_carbs == 20

    def test_bunless_is_strict_keto(self):
        # Round-4: 'bunless burger' is canonical keto phrasing — same 15g bar
        assert parse_intent('bunless burger').max_carbs == 15
        assert parse_intent('low carb high fat meal').max_carbs == 15
        assert parse_intent('meal without bread').max_carbs == 20

    def test_high_protein_default_threshold(self):
        assert parse_intent('high protein meal').min_protein == 30

    def test_high_fat_sets_fat_floor(self):
        # Round-2 fix: keto's other half was silently dropped
        intent = parse_intent('low carb high fat meal')
        assert intent.min_fat == 20
        assert intent.max_carbs == 15  # canonical keto phrasing = strict cap

    def test_value_seeking_parsed(self):
        assert parse_intent('cheap high protein lunch').value_seek is True
        assert parse_intent('best value dinner').value_seek is True

    def test_typo_protien_still_parses(self):
        assert parse_intent('hi protien lo carb dinner').min_protein == 30
        assert parse_intent('hi protien lo carb dinner').max_carbs == 20

    def test_spanish_low_carb(self):
        intent = parse_intent('comida alta en proteinas y baja en carbohidratos')
        assert intent.min_protein == 30
        assert intent.max_carbs == 20


class TestDietaryParsing:
    def test_vegetarian(self):
        assert parse_intent('vegetarian high protein').vegetarian is True

    def test_vegan_implies_vegetarian(self):
        intent = parse_intent('vegan bowl')
        assert intent.vegan is True and intent.vegetarian is True

    def test_no_meat(self):
        assert parse_intent('dinner with no meat').vegetarian is True

    @pytest.mark.parametrize('query', [
        'paneer butter masala with rice', 'tofu stir fry', 'falafel wrap', 'chana masala'])
    def test_vegetarian_dish_names_imply_dietary_constraint(self, query):
        # Round-3 CRITICAL: 'paneer' must never return a gyro bowl
        assert parse_intent(query).vegetarian is True


class TestSpelledNumbersAndExclusions:
    def test_spelled_out_calorie_and_protein_constraints(self):
        # Round-3: spelled numbers were silently ignored AND violators
        # green-badged
        intent = parse_intent('dinner under six hundred calories with at least forty grams of protein')
        assert intent.calorie_limit == 600
        assert intent.min_protein == 40

    def test_spelled_compound_number(self):
        assert parse_intent('under one hundred and forty grams of carbs').max_carbs == 140

    def test_no_rice_becomes_exclusion_and_leaves_embedding_clean(self):
        intent = parse_intent('grilled salmon with butter and vegetables no rice')
        assert 'rice' in intent.excluded_terms
        assert 'no rice' not in intent.cleaned_query.lower()
        assert 'salmon' in intent.cleaned_query.lower()

    def test_without_mayo_excluded(self):
        assert 'mayo' in parse_intent('turkey club without mayo').excluded_terms

    def test_no_meat_stays_a_dietary_intent_not_an_exclusion(self):
        intent = parse_intent('dinner with no meat')
        assert intent.vegetarian is True
        assert 'meat' not in intent.excluded_terms


# ── Constraint filtering (via _passes) ───────────────────────────────────────

def make_candidate(name, protein=0, carbs=0, calories=0, fat=0, price=0,
                   currency='USD', tags='', score=0.5, id=None,
                   description='', platform='ubereats'):
    return {
        'id': id or name,
        'score': score,
        'metadata': {
            'name': name, 'description': description, 'protein': protein,
            'carbs': carbs, 'calories': calories, 'fat': fat, 'price': price,
            'currency': currency, 'dietary_tags': tags, 'platform': platform,
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

    def test_vegetarian_checks_description_not_just_name(self, svc):
        # Round-2 CRITICAL: "Harvest Bowl" sounds meatless; its description
        # says roasted chicken
        intent = QueryIntent(vegetarian=True)
        bowl = make_candidate('Harvest Bowl', description='Roasted chicken, sweet potatoes, wild rice')
        assert not svc._passes(bowl, intent)
        nuggets = make_candidate('Grilled Nuggets (12 ct)', description='Bite-sized grilled chicken')
        assert not svc._passes(nuggets, intent)

    def test_fat_floor_enforced(self, svc):
        intent = QueryIntent(max_carbs=20, min_fat=20)
        assert svc._passes(make_candidate('Steak', carbs=5, fat=42), intent)
        assert not svc._passes(make_candidate('Egg White Omelette', carbs=8, fat=9), intent)

    def test_value_seek_requires_usd_price(self, svc):
        intent = QueryIntent(value_seek=True)
        assert svc._passes(make_candidate('Priced', price=9.99, currency='USD'), intent)
        assert not svc._passes(make_candidate('Unpriced', price=349, currency=''), intent)

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
                'id': c['id'], 'name': md['name'], 'ingredients': [],
                'description': md.get('description') or None,
                'dietary_tags': [t for t in (md.get('dietary_tags') or '').split(',') if t],
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
        # The qualifying item leads with the green flag; the over-budget item
        # may follow only as an explicitly flagged near-miss
        assert results[0]['recipe'].name == 'Cheap Protein'
        assert results[0]['meets_constraints'] is True
        assert all(r['meets_constraints'] is False for r in results[1:])

    def test_vegan_with_unreachable_macro_falls_back_within_vegan_pool(self):
        # Round-2 fix: "vegan high protein" must degrade to the best vegan
        # options, never a blank screen (and never meat)
        candidates = [
            make_candidate('Chicken Bowl', protein=45, score=0.6),
            make_candidate('Tofu Stir-Fry', protein=22, tags='vegan', score=0.5),
            make_candidate('Falafel Bowl', protein=17, tags='vegan,vegetarian', score=0.45),
        ]
        results = run_search(candidates, 'vegan high protein')
        names = [r['recipe'].name for r in results]
        assert 'Chicken Bowl' not in names
        assert names[0] == 'Tofu Stir-Fry'  # closest to the protein target
        assert all(r['meets_constraints'] is False for r in results)

    def test_combined_constraint_fallback_ranks_by_composite_shortfall(self):
        # Round-2 fix: '50g protein under 500 cal' must surface the 45g/400cal
        # dish, not low-protein items that merely fit the calorie cap
        candidates = [
            make_candidate('Avocado Toast', protein=10, calories=340, score=0.6),
            make_candidate('Tilapia Fish', protein=45, calories=400, score=0.4),
            make_candidate('Yogurt Parfait', protein=18, calories=250, score=0.5),
        ]
        results = run_search(candidates, '50g protein under 500 calories')
        assert results[0]['recipe'].name == 'Tilapia Fish'
        assert all(r['meets_constraints'] is False for r in results)

    def test_unorderable_platform_demoted_at_equal_relevance(self):
        candidates = [
            make_candidate('Partner Keto Plate', protein=45, carbs=8, score=0.52, platform='biterush'),
            make_candidate('Orderable Keto Bowl', protein=42, carbs=10, score=0.48, platform='ubereats'),
        ]
        results = run_search(candidates, 'keto dinner')
        # 0.48 orderable beats 0.52 unorderable after the 0.08 demotion
        assert results[0]['recipe'].name == 'Orderable Keto Bowl'

    def test_excluded_term_drops_matching_items(self):
        candidates = [
            make_candidate('Crispy Rice Bowl', description='Blackened salmon over crispy rice', score=0.6),
            make_candidate('Grilled Salmon Plate', description='Salmon with seasonal vegetables', score=0.5),
        ]
        results = run_search(candidates, 'grilled salmon no rice')
        names = [r['recipe'].name for r in results]
        assert names == ['Grilled Salmon Plate']

    def test_untagged_vegetarian_result_is_unverified_not_green(self):
        # Round-3: absence of meat words is not proof of vegetarian
        candidates = [
            make_candidate('Build Your Own Pizza', description='dough, red sauce, two toppings',
                           protein=38, score=0.5),
        ]
        results = run_search(candidates, 'vegetarian high protein')
        assert results[0]['meets_constraints'] is False
        assert 'unverified' in results[0]['match_explanation'].lower()

    def test_tagged_vegetarian_result_stays_verified(self):
        candidates = [
            make_candidate('Paneer Tikka', tags='vegetarian,high-protein', protein=35, score=0.5),
        ]
        results = run_search(candidates, 'vegetarian high protein')
        assert results[0]['meets_constraints'] is True

    def test_low_relevance_never_gets_green_badge(self):
        # Round-3: soup must not "fit" a dessert search just because macros do
        candidates = [make_candidate('Broccoli Cheddar Soup', calories=360, score=0.27)]
        results = run_search(candidates, 'dessert under 500 calories')
        assert results[0]['meets_constraints'] is False

    def test_thin_results_append_labeled_near_misses(self):
        # Round-3 nice-to-have: 1 strict match shouldn't be a dead end
        candidates = [
            make_candidate('Perfect Bowl', protein=45, calories=450, score=0.55),
            make_candidate('Near Miss A', protein=38, calories=420, score=0.5),
            make_candidate('Near Miss B', protein=36, calories=480, score=0.45),
        ]
        results = run_search(candidates, '40g protein under 500 calories')
        assert results[0]['recipe'].name == 'Perfect Bowl'
        assert results[0]['meets_constraints'] is True
        assert len(results) >= 2
        assert all(r['meets_constraints'] is False for r in results[1:])

    def test_unorderable_items_capped_and_ranked_below_orderable(self):
        candidates = (
            [make_candidate(f'Partner {i}', protein=40 + i, carbs=5, score=0.6, platform='biterush', tags='keto-friendly') for i in range(4)]
            + [make_candidate('Orderable Keto', protein=40, carbs=8, score=0.4, platform='ubereats')]
        )
        results = run_search(candidates, 'keto dinner')
        names = [r['recipe'].name for r in results]
        assert names[0] == 'Orderable Keto'
        assert sum(1 for n in names if n.startswith('Partner')) <= 2

    def test_dish_type_gate_denies_green_badge_to_wrong_dish(self):
        # Round-4: a brownie is not a "low calorie pizza"
        candidates = [
            make_candidate('Chocolate Brownie', calories=400, score=0.45,
                           description='fudgy chocolate brownie'),
        ]
        results = run_search(candidates, 'low calorie pizza')
        assert results[0]['meets_constraints'] is False

    def test_dish_type_gate_passes_matching_dish(self):
        candidates = [
            make_candidate('Keto Crust Pizza', calories=450, carbs=12, score=0.5,
                           description='cauliflower crust pizza', tags='keto-friendly'),
        ]
        results = run_search(candidates, 'low calorie pizza')
        assert results[0]['meets_constraints'] is True

    def test_drinks_never_fit_meal_queries(self):
        candidates = [
            make_candidate('Ramune Soda', calories=90, score=0.4, description='japanese soda'),
        ]
        results = run_search(candidates, 'light dinner under 300 calories')
        assert results[0]['meets_constraints'] is False

    def test_unknown_restaurant_returns_empty_not_global(self):
        candidates = [make_candidate('Burger', score=0.6)]
        svc = EnhancedAISearchService(FakeVectors(candidates), FakeDB(candidates))
        assert svc.search('burger', restaurant_filter='Totally Fake Diner XYZ') == []

    def test_keto_friendly_wording_requires_the_tag(self):
        # Round-4: 'keto-friendly' is a tag claim, not inferred from carbs
        candidates = [
            make_candidate('Steak Bowl', protein=39, carbs=15, calories=380,
                           score=0.5, tags='high-protein,low-carb'),
        ]
        results = run_search(candidates, 'keto dinner')
        assert 'keto-friendly' not in results[0]['match_explanation']
        assert 'total carbs' in results[0]['match_explanation']

    def test_partner_items_labeled_in_explanation(self):
        candidates = [
            make_candidate('Keto Steak & Eggs', protein=52, carbs=6, calories=610,
                           score=0.6, platform='biterush', tags='keto-friendly'),
            make_candidate('Orderable Keto Bowl', protein=42, carbs=8, calories=500,
                           score=0.5, platform='ubereats'),
        ]
        results = run_search(candidates, 'keto dinner')
        partner = next(r for r in results if r['recipe'].source_platform == 'biterush')
        assert 'partner preview' in partner['match_explanation']

    def test_value_query_ranks_by_protein_per_dollar(self):
        candidates = [
            make_candidate('Pricey Protein', protein=50, price=20.0, score=0.6),   # 2.5 g/$
            make_candidate('Value Protein', protein=40, price=8.0, score=0.4),     # 5.0 g/$
            make_candidate('Unpriced Partner', protein=60, price=349, currency='', score=0.7, platform='biterush'),
        ]
        results = run_search(candidates, 'cheap high protein meal')
        names = [r['recipe'].name for r in results]
        assert names[0] == 'Value Protein'
        assert 'Unpriced Partner' not in names


# ── Explanations ─────────────────────────────────────────────────────────────

class TestExplanationService:
    def test_calorie_query_mentions_calories_and_macros(self):
        recipe = Recipe(name='Salad', estimated_calories=280, estimated_protein=9, estimated_carbs=18)
        text = ExplanationService.generate_explanation('under 500 cal', recipe)
        assert '280' in text and '9' in text and '18' in text

    def test_protein_carb_query_mentions_ratio_and_keto(self):
        # 'keto-friendly' in the explanation is earned by the TAG, not carbs
        recipe = Recipe(name='Steak', estimated_protein=50, estimated_carbs=5,
                        estimated_calories=610, dietary_tags=['keto-friendly'])
        text = ExplanationService.generate_explanation('high protein low carb', recipe)
        assert 'ratio' in text.lower()
        assert 'keto' in text.lower()

    def test_protein_carb_query_no_keto_claim_without_tag(self):
        recipe = Recipe(name='Steak', estimated_protein=50, estimated_carbs=5, estimated_calories=610)
        text = ExplanationService.generate_explanation('high protein low carb', recipe)
        assert 'keto' not in text.lower()

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
        assert text.count('380') == 1  # each number stated exactly once

    def test_at_limit_boundary_wording(self):
        recipe = Recipe(name='Bowl', estimated_calories=400, estimated_protein=30, estimated_carbs=20)
        intent = parse_intent('under 400 cal')
        text = ExplanationService.generate_explanation(
            'under 400 cal', recipe, intent=intent, meets_constraints=False)
        assert 'at your 400 cal limit' in text

    def test_low_carb_enforcement_is_visible(self):
        # Round-2 fix: two personas concluded 'low carb' was ignored because
        # explanations never mentioned carbs
        recipe = Recipe(name='Cobb Salad', estimated_carbs=18, estimated_protein=35, estimated_calories=450)
        text = ExplanationService.generate_explanation('low carb salad', recipe)
        assert '18g carbs' in text
        assert 'fits your low-carb target' in text

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
