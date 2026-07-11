"""Tests for dietary-tag normalization and honesty rules."""

from utils.tags import sanitize_dietary_tags


class TestTagVocabulary:
    def test_aliases_normalized(self):
        assert sanitize_dietary_tags(['keto'], carbs=10) == ['keto-friendly']
        assert sanitize_dietary_tags(['low carb'], carbs=25) == ['low-carb']
        assert sanitize_dietary_tags(['plant based']) == ['vegan']

    def test_dedupe_after_normalization(self):
        assert sanitize_dietary_tags(['keto', 'keto-friendly'], carbs=5) == ['keto-friendly']


class TestTagHonesty:
    def test_keto_tag_dropped_over_15g_carbs(self):
        # Round-3: an 18g-carb 'Keto Crust Pizza' must not wear the badge
        assert 'keto-friendly' not in sanitize_dietary_tags(
            ['keto-friendly', 'low-carb'], carbs=18)

    def test_low_carb_survives_at_18g(self):
        assert 'low-carb' in sanitize_dietary_tags(['low-carb'], carbs=18)

    def test_high_protein_dropped_below_30g(self):
        assert sanitize_dietary_tags(['high-protein'], protein=14) == []

    def test_veg_tags_dropped_when_meat_in_description(self):
        tags = sanitize_dietary_tags(
            ['vegetarian'], name='Create Your Own Pasta',
            description='choice of chicken or shrimp')
        assert 'vegetarian' not in tags

    def test_clean_vegetarian_item_keeps_tags(self):
        tags = sanitize_dietary_tags(
            ['vegetarian', 'high-protein'], protein=35,
            name='Paneer Tikka', description='cottage cheese skewers')
        assert tags == ['vegetarian', 'high-protein']
