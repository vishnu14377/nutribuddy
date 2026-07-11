"""Dietary-tag normalization and honesty rules, shared by every ingest path.

A tag is a promise on the card. These rules make sure the vocabulary is
consistent across platforms ('keto' vs 'keto-friendly') and that no tag
contradicts the item's own macros or ingredients.
"""

import re
from typing import List

MEAT_WORDS_RE = re.compile(
    r'chicken|beef|steak|lamb|pork|bacon|ham\b|turkey|salmon|tuna|shrimp|prawn|'
    r'fish|crab|gyro|kofta|meatball|pepperoni|sausage|chorizo|brisket|ribs?\b|'
    r'wings?\b|carnitas|pastrami|prosciutto|anchov|nuggets?\b|duck|veal|lobster|'
    r'calamari|squid|oysters?\b|clams?\b|scallops?\b|burgers?\b', re.IGNORECASE
)


def is_meat_named(name: str, description: str = '') -> bool:
    """True when the item's name/description mentions meat/poultry/seafood.

    Tag checks run first everywhere this is used, so tagged veggie burgers
    are unaffected by 'burger' counting as meat.
    """
    return bool(MEAT_WORDS_RE.search(f"{name} {description}"))

# Canonical vocabulary: platform data drifts ('keto', 'keto friendly', ...)
TAG_ALIASES = {
    'keto': 'keto-friendly',
    'keto friendly': 'keto-friendly',
    'low carb': 'low-carb',
    'high protein': 'high-protein',
    'gluten free': 'gluten-free',
    'plant-based': 'vegan',
    'plant based': 'vegan',
}

KETO_TAG_MAX_CARBS = 15
LOW_CARB_TAG_MAX_CARBS = 30
HIGH_PROTEIN_TAG_MIN = 30


def sanitize_dietary_tags(tags: List[str], *, carbs: float = 0, protein: float = 0,
                          name: str = '', description: str = '') -> List[str]:
    """Normalize tag vocabulary and drop tags the item's own data contradicts."""
    normalized = []
    for tag in tags or []:
        key = (tag or '').strip().lower()
        if not key:
            continue
        normalized.append(TAG_ALIASES.get(key, key))
    # dedupe, keep order
    seen = set()
    tags = [t for t in normalized if not (t in seen or seen.add(t))]

    carbs = carbs or 0
    protein = protein or 0
    if carbs > KETO_TAG_MAX_CARBS:
        tags = [t for t in tags if t != 'keto-friendly']
    if carbs > LOW_CARB_TAG_MAX_CARBS:
        tags = [t for t in tags if t != 'low-carb']
    if protein < HIGH_PROTEIN_TAG_MIN:
        tags = [t for t in tags if t != 'high-protein']
    if MEAT_WORDS_RE.search(f"{name} {description}"):
        tags = [t for t in tags if t not in ('vegetarian', 'vegan')]
    return tags
