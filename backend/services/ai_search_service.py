"""Enhanced AI search service - fast, honest, constraint-driven.

Design (from customer-evaluation round 1):
- Nutrition/price constraints are FILTERS on top of vector relevance ordering,
  never replacement sorts — so the display order always matches the ranking the
  user sees, and semantic relevance survives constraint queries.
- Constraint misses are never silent: when nothing qualifies, the closest items
  are returned with meets_constraints=False so the UI can say so.
- No LLM calls at query time; one embedding call per search.
"""

import re
import logging
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

from services.vector_service import VectorService
from services.database_service import DatabaseService
from models.recipe import Recipe

logger = logging.getLogger(__name__)

# Below this cosine similarity, results are noise — better an honest empty
# state than a page of 17%-match filler (scores in practice top out ~0.62).
RELEVANCE_FLOOR = 0.25

# Items above this are almost certainly multi-serving (family meals, whole
# catering trays) and are excluded from single-meal nutrition queries.
SINGLE_MEAL_CALORIE_CEILING = 1400

MULTI_SERVING_NAME_RE = re.compile(
    r'family|meal deal|party pack|party size|bundle|2 liter|2-liter|'
    r'\(\s*\d+\s*servings?\s*\)', re.IGNORECASE
)

MEAT_WORDS_RE = re.compile(
    r'chicken|beef|steak|lamb|pork|bacon|ham\b|turkey|salmon|tuna|shrimp|prawn|'
    r'fish|crab|gyro|kofta|meatball|pepperoni|sausage|chorizo|brisket|ribs?\b|'
    r'wings?\b|carnitas|pastrami|prosciutto|anchov|nuggets?\b|duck|veal|lobster|'
    r'calamari|squid|oysters?\b|clams?\b|scallops?\b', re.IGNORECASE
)

# Platforms with a working order handoff. Items from other sources are valid
# results but get a small ranking demotion so orderable dishes win ties —
# a Top Pick the user cannot buy breaks the product's core promise.
ORDERABLE_PLATFORMS = {'ubereats', 'doordash'}
UNORDERABLE_SCORE_PENALTY = 0.08

PROTEIN_TERMS = (
    'high protein', 'protein rich', 'protein-rich', 'high-protein',
    'lots of protein', 'more protein', 'protein heavy', 'protein', 'protien',
    'proteina', 'proteinas',
)
LOW_CARB_TERMS = (
    'low carb', 'low-carb', 'low carbs', 'lo carb', 'fewer carbs', 'less carbs',
    'keto', 'no carbs', 'baja en carb', 'bajo en carb', 'sin carb',
)
STRICT_KETO_TERMS = ('keto',)
NO_BREAD_TERMS = ('bunless', 'no bun', 'no bread', 'lettuce wrap', 'without bun', 'without bread')
VEGETARIAN_TERMS = ('vegetarian', 'meatless', 'plant based', 'plant-based', 'no meat', 'veggie', 'vegetariano')
VEGAN_TERMS = ('vegan', 'vegano')
LOW_CAL_INTENT_TERMS = ('low cal', 'low-cal', 'light', 'diet', 'healthy')
HIGH_FAT_TERMS = ('high fat', 'high-fat', 'alta en grasa')
VALUE_TERMS = ('cheap', 'budget', 'best value', 'affordable', 'value for money', 'good value')

# Default threshold when the user says "high protein" without a number.
DEFAULT_MIN_PROTEIN = 30
# "keto" means a strict per-meal carb budget; "low carb" is a real constraint
# too — 28g of carbs presented as a clean "low carb" match reads as ignored.
KETO_MAX_CARBS = 15
LOW_CARB_MAX_CARBS = 20
NO_BREAD_MAX_CARBS = 20
GENERAL_LOW_CAL_LIMIT = 500
# "high fat" (the other half of keto) is a floor, not a cap.
DEFAULT_MIN_FAT = 20


@dataclass
class QueryIntent:
    """Structured constraints parsed from a natural-language query."""

    calorie_limit: Optional[int] = None
    max_carbs: Optional[float] = None
    min_protein: Optional[float] = None
    min_fat: Optional[float] = None
    max_fat: Optional[float] = None
    price_limit: Optional[float] = None
    vegetarian: bool = False
    vegan: bool = False
    value_seek: bool = False   # "cheap" / "best value" — rank by value among USD-priced items
    impossible: bool = False   # e.g. "under 0 calories"

    def has_nutrition_constraint(self) -> bool:
        return any(v is not None for v in (
            self.calorie_limit, self.max_carbs, self.min_protein, self.min_fat, self.max_fat
        )) or self.vegetarian or self.vegan

    def has_any_constraint(self) -> bool:
        return self.has_nutrition_constraint() or self.price_limit is not None or self.value_seek

    def dietary_only(self) -> 'QueryIntent':
        """Just the vegetarian/vegan part — used to build the safe fallback pool."""
        return QueryIntent(vegetarian=self.vegetarian, vegan=self.vegan)

    def constraint_labels(self) -> List[str]:
        labels = []
        if self.calorie_limit is not None:
            labels.append(f"under {self.calorie_limit} cal")
        if self.max_carbs is not None:
            labels.append(f"≤{self.max_carbs:g}g carbs")
        if self.min_protein is not None:
            labels.append(f"≥{self.min_protein:g}g protein")
        if self.min_fat is not None:
            labels.append(f"≥{self.min_fat:g}g fat")
        if self.max_fat is not None:
            labels.append(f"≤{self.max_fat:g}g fat")
        if self.price_limit is not None:
            labels.append(f"under ${self.price_limit:g}")
        if self.value_seek:
            labels.append("best value")
        if self.vegan:
            labels.append("vegan")
        elif self.vegetarian:
            labels.append("vegetarian")
        return labels


def parse_intent(query: str) -> QueryIntent:
    """Parse nutrition/price constraints from a plain-English query.

    Extraction order matters: gram-level macro limits and dollar limits are
    matched and REMOVED from the working string first, so the bare calorie
    pattern ("under 400") can never swallow "under 15g carbs" or "under $12".
    """
    intent = QueryIntent()
    work = query.lower()

    # 1. Gram-level macro limits: "under 15g carbs", "max 20 grams of fat"
    def take(pattern, handler):
        nonlocal work
        for m in list(re.finditer(pattern, work)):
            handler(m)
        work = re.sub(pattern, ' ', work)

    take(
        r'(?:under|below|less\s*than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?(carbs?|protein|fat)',
        lambda m: setattr(intent,
                          {'c': 'max_carbs', 'p': 'min_protein', 'f': 'max_fat'}[m.group(2)[0]],
                          float(m.group(1)))
    )
    # "under Ng protein" reads as a minimum ask in food search ("at least Ng")
    # is ambiguous — treat explicit "under ... protein" as stated (rare), but
    # the common phrasing "40g protein meal" is a minimum target:
    take(
        r'(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?protein',
        lambda m: setattr(intent, 'min_protein', float(m.group(1)))
    )
    take(
        r'(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?(carbs?)',
        lambda m: setattr(intent, 'max_carbs', float(m.group(1)))
    )

    # 2. Price limits: "$12", "under 12 dollars", "below 15 bucks"
    take(
        r'(?:under|below|less\s*than|max(?:imum)?)?\s*\$\s*(\d+(?:\.\d+)?)',
        lambda m: setattr(intent, 'price_limit', float(m.group(1)))
    )
    take(
        r'(?:under|below|less\s*than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)',
        lambda m: setattr(intent, 'price_limit', float(m.group(1)))
    )

    # 3. Calorie limits, on the remaining string
    calorie_patterns = [
        r'(?:under|below|less\s*than|max(?:imum)?)\s*(\d+)\s*(?:k?cal(?:orie)?s?)',
        r'(\d+)\s*(?:k?cal(?:orie)?s?)\s*(?:or\s*less|or\s*under|max(?:imum)?)',
        r'<\s*(\d+)\s*(?:k?cal(?:orie)?s?)?',
        r'(\d+)\s*calorie\b',          # "300 calorie lunch"
        r'(?:under|below)\s*(\d+)\b',  # bare "under 400" (macros/$ already removed)
    ]
    for pattern in calorie_patterns:
        m = re.search(pattern, work)
        if m:
            limit = int(m.group(1))
            if limit <= 0:
                intent.impossible = True
            else:
                intent.calorie_limit = limit
            break

    if intent.calorie_limit is None and not intent.impossible:
        if any(term in work for term in LOW_CAL_INTENT_TERMS):
            intent.calorie_limit = GENERAL_LOW_CAL_LIMIT

    # 4. Protein/carb keyword intents (only when no explicit number given)
    if intent.min_protein is None and any(t in work for t in PROTEIN_TERMS):
        intent.min_protein = DEFAULT_MIN_PROTEIN
    if intent.max_carbs is None:
        if any(t in work for t in STRICT_KETO_TERMS):
            intent.max_carbs = KETO_MAX_CARBS
        elif any(t in work for t in NO_BREAD_TERMS):
            intent.max_carbs = NO_BREAD_MAX_CARBS
        elif any(t in work for t in LOW_CARB_TERMS):
            intent.max_carbs = LOW_CARB_MAX_CARBS

    # 5. Fat floor ("high fat" — the other half of keto)
    if intent.min_fat is None and any(t in work for t in HIGH_FAT_TERMS):
        intent.min_fat = DEFAULT_MIN_FAT

    # 6. Dietary intents
    if any(t in work for t in VEGAN_TERMS):
        intent.vegan = True
        intent.vegetarian = True
    elif any(t in work for t in VEGETARIAN_TERMS):
        intent.vegetarian = True

    # 7. Value seeking
    if any(t in work for t in VALUE_TERMS):
        intent.value_seek = True

    return intent


class EnhancedAISearchService:
    """Fast AI-powered search: vector relevance + hard constraint filters."""

    def __init__(
        self,
        vector_service: VectorService,
        db_service: DatabaseService,
        openai_api_key: str = None
    ):
        """Initialize search service."""
        self.vector_service = vector_service
        self.db_service = db_service
        logger.info("Fast AI Search Service initialized")

    def search(
        self,
        query: str,
        top_k: int = 10,
        restaurant_filter: Optional[str] = None,
        platform_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search with constraint filtering. No LLM calls at query time.

        Each result dict carries meets_constraints: False on the honest-fallback
        path (nothing fully qualified; these are the closest options).
        """
        intent = parse_intent(query)
        log_suffix = f" [restaurant={restaurant_filter}]" if restaurant_filter else ""
        if platform_filter:
            log_suffix += f" [platform={platform_filter}]"
        logger.info(f"Search: '{query}' -> {intent}{log_suffix}")

        if intent.impossible:
            logger.info("Impossible constraint (e.g. under 0 cal) — honest empty result")
            return []

        # Boost semantic relevance by including restaurant name in the query
        search_query = f"{query} at {restaurant_filter}" if restaurant_filter else query

        # Wider candidate pool when constraints will thin it out
        pool_size = 75 if intent.has_any_constraint() else 50
        filters = {'platform': platform_filter} if platform_filter else None
        candidates = self.vector_service.search(search_query, top_k=pool_size, filters=filters)
        logger.info(f"Vector search returned {len(candidates)} candidates")

        if not candidates:
            return []

        # Restaurant narrowing (fuzzy, post-filter)
        if restaurant_filter:
            restaurant_lower = restaurant_filter.lower()
            matched = [
                c for c in candidates
                if restaurant_lower in (c.get('metadata', {}).get('restaurant', '') or '').lower()
            ]
            if matched:
                candidates = matched
            else:
                logger.warning(f"No results for restaurant '{restaurant_filter}', keeping global matches")

        # Honest empty state: drop noise-level matches entirely
        candidates = [c for c in candidates if c['score'] >= RELEVANCE_FLOOR]
        if not candidates:
            logger.info("All candidates below relevance floor — honest empty result")
            return []

        # The dietary constraint is HARD: meat never substitutes for vegetarian.
        # Macro constraints soften to a closest-option fallback WITHIN the
        # dietary-safe pool, so "vegan high protein" degrades to the best vegan
        # options instead of a blank screen.
        if intent.vegetarian or intent.vegan:
            pool = [c for c in candidates if self._passes(c, intent.dietary_only())]
            if not pool:
                logger.info("No vegetarian/vegan matches — honest empty result")
                return []
        else:
            pool = candidates

        qualified = [c for c in pool if self._passes(c, intent)]

        if qualified:
            results, meets = qualified, True
        elif intent.has_any_constraint():
            results, meets = self._closest_fallback(pool, intent), False
            logger.info(f"No items satisfy {intent.constraint_labels()} — returning {len(results)} closest, flagged")
        else:
            results, meets = pool, True

        if meets:
            # Constraints filter; vector relevance ranks — with a small demotion
            # for items the user cannot actually order.
            if intent.value_seek:
                results = self._rank_by_value(results, intent)
            else:
                results = sorted(results, key=self._rank_key, reverse=True)
        # Fallback results keep their closest-first ordering — re-sorting by
        # score would bury the item that misses the constraint least.

        # Dedup + batch fetch (avoids N+1 queries)
        top_results = []
        seen_ids = set()
        for result in results[:top_k]:
            if result['id'] not in seen_ids:
                seen_ids.add(result['id'])
                top_results.append(result)

        recipe_docs = self.db_service.get_recipes_by_ids([r['id'] for r in top_results])
        recipes_dict = {doc['id']: doc for doc in recipe_docs}

        final_results = []
        for result in top_results:
            recipe_doc = recipes_dict.get(result['id'])
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                # Belt-and-suspenders diet safety: metadata descriptions are
                # truncated, so re-verify against the full stored description.
                if (intent.vegetarian or intent.vegan):
                    tags = ' '.join(recipe.dietary_tags or []).lower()
                    tagged = ('vegan' in tags) if intent.vegan else ('vegetarian' in tags or 'vegan' in tags)
                    if not tagged and (intent.vegan or MEAT_WORDS_RE.search(f"{recipe.name} {recipe.description or ''}")):
                        logger.warning(f"Diet-safety drop: {recipe.name} (untagged, meat words in description)")
                        continue
                final_results.append({
                    'recipe': recipe,
                    'match_score': result['score'],
                    'match_explanation': ExplanationService.generate_explanation(
                        query, recipe, intent=intent, meets_constraints=meets
                    ),
                    'meets_constraints': meets,
                })

        logger.info(f"Returning {len(final_results)} results (meets_constraints={meets})")
        return final_results

    @staticmethod
    def _rank_key(candidate: Dict) -> float:
        """Vector score, minus a small demotion for un-orderable sources."""
        platform = candidate.get('metadata', {}).get('platform', '') or ''
        penalty = 0 if platform in ORDERABLE_PLATFORMS else UNORDERABLE_SCORE_PENALTY
        return candidate['score'] - penalty

    @staticmethod
    def _rank_by_value(results: List[Dict], intent: QueryIntent) -> List[Dict]:
        """'cheap' / 'best value': rank USD-priced items by value, not similarity."""
        def md(c, key, default=0):
            return c.get('metadata', {}).get(key, default) or default

        priced = [c for c in results if md(c, 'currency', '') == 'USD' and md(c, 'price') > 0]
        if not priced:
            return results
        if intent.min_protein is not None:
            return sorted(priced, key=lambda c: md(c, 'protein') / md(c, 'price'), reverse=True)
        return sorted(priced, key=lambda c: md(c, 'price'))

    def _passes(self, candidate: Dict, intent: QueryIntent) -> bool:
        """Hard constraint filter for one candidate, using vector metadata."""
        md = candidate.get('metadata', {})
        name = md.get('name', '') or ''
        description = md.get('description', '') or ''
        calories = md.get('calories', 0) or 0
        protein = md.get('protein', 0) or 0
        carbs = md.get('carbs', 0) or 0
        fat = md.get('fat', 0) or 0
        price = md.get('price', 0) or 0
        currency = md.get('currency', '') or ''
        tags = (md.get('dietary_tags', '') or '').lower()

        # Multi-serving items never belong in single-meal nutrition queries
        if intent.has_nutrition_constraint():
            if MULTI_SERVING_NAME_RE.search(name):
                return False
            if calories > SINGLE_MEAL_CALORIE_CEILING and intent.calorie_limit is None:
                return False

        if intent.vegan and 'vegan' not in tags:
            return False
        if intent.vegetarian and not intent.vegan:
            is_tagged = 'vegetarian' in tags or 'vegan' in tags
            # Descriptions matter: "Harvest Bowl" sounds meatless but its
            # description says "roasted chicken" — check both.
            if not is_tagged and MEAT_WORDS_RE.search(f"{name} {description}"):
                return False

        if intent.calorie_limit is not None and not calories < intent.calorie_limit:
            return False
        if intent.max_carbs is not None and carbs > intent.max_carbs:
            return False
        if intent.min_protein is not None and protein < intent.min_protein:
            return False
        if intent.min_fat is not None and fat < intent.min_fat:
            return False
        if intent.max_fat is not None and fat > intent.max_fat:
            return False
        # Price limits only compare like-for-like: USD-labeled items
        if intent.price_limit is not None:
            if currency != 'USD' or price <= 0 or price > intent.price_limit:
                return False
        if intent.value_seek:
            if currency != 'USD' or price <= 0:
                return False
        return True

    def _closest_fallback(self, candidates: List[Dict], intent: QueryIntent) -> List[Dict]:
        """Nothing qualified: return the items with the smallest composite
        shortfall across ALL set constraints (a 45g-protein/400-cal dish is the
        right answer to '50g protein under 500 cal', not low-protein toast)."""
        def md(c, key, default=0):
            return c.get('metadata', {}).get(key, default) or default

        pool = candidates
        if intent.has_nutrition_constraint():
            pool = [c for c in pool if not MULTI_SERVING_NAME_RE.search(md(c, 'name', ''))] or pool

        def shortfall(c) -> float:
            total = 0.0
            if intent.calorie_limit is not None:
                total += max(0, md(c, 'calories') - intent.calorie_limit) / intent.calorie_limit
            if intent.max_carbs is not None:
                total += max(0, md(c, 'carbs') - intent.max_carbs) / intent.max_carbs
            if intent.min_protein is not None:
                total += max(0, intent.min_protein - md(c, 'protein')) / intent.min_protein
            if intent.min_fat is not None:
                total += max(0, intent.min_fat - md(c, 'fat')) / intent.min_fat
            if intent.max_fat is not None:
                total += max(0, md(c, 'fat') - intent.max_fat) / intent.max_fat
            if intent.price_limit is not None:
                if md(c, 'currency', '') == 'USD' and md(c, 'price') > 0:
                    total += max(0, md(c, 'price') - intent.price_limit) / intent.price_limit
                else:
                    total += 1.0  # unpriced/foreign items are far from a budget ask
            return total

        return sorted(pool, key=lambda c: (shortfall(c), -c['score']))[:5]


class ExplanationService:
    """Fast local explanation generator (no API calls)."""

    @staticmethod
    def generate_explanation(
        query: str,
        recipe: Recipe,
        intent: Optional[QueryIntent] = None,
        meets_constraints: bool = True,
    ) -> str:
        """Generate an honest explanation instantly, without an LLM."""
        if intent is None:
            intent = parse_intent(query)
        query_lower = query.lower()
        parts = []

        protein = recipe.estimated_protein or 0
        carbs = recipe.estimated_carbs or 0
        calories = recipe.estimated_calories or 0
        fat = recipe.estimated_fat or 0

        # Honest phrasing when this item is a closest-option fallback
        if intent is not None and not meets_constraints:
            missed = []
            if intent.calorie_limit is not None and calories >= intent.calorie_limit:
                word = 'at' if calories == intent.calorie_limit else 'over'
                missed.append(f"{calories} cal ({word} your {intent.calorie_limit} cal limit)")
            if intent.max_carbs is not None and carbs > intent.max_carbs:
                missed.append(f"{carbs:g}g carbs (over your {intent.max_carbs:g}g limit)")
            if intent.min_protein is not None and protein < intent.min_protein:
                missed.append(f"{protein:g}g protein (below your {intent.min_protein:g}g target)")
            if intent.min_fat is not None and fat < intent.min_fat:
                missed.append(f"{fat:g}g fat (below your {intent.min_fat:g}g target)")
            head = "Closest option — " + "; ".join(missed) if missed else "Closest available option"
            # State each number exactly once
            tail = []
            if not any('protein' in m for m in missed):
                tail.append(f"{protein:g}g protein")
            if not any('carbs' in m for m in missed):
                tail.append(f"{carbs:g}g carbs")
            if not any('cal (' in m for m in missed):
                tail.append(f"{calories} cal")
            return f"{head} • {' • '.join(tail)}" if tail else head

        # Calorie-focused queries
        if intent is not None and intent.calorie_limit is not None:
            if calories < 300:
                parts.append(f"Very light at {calories} calories")
            elif calories < 500:
                parts.append(f"Light meal at {calories} calories")
            else:
                parts.append(f"{calories} calories")
            parts.append(f"{protein:g}g protein • {carbs:g}g carbs")
            return " • ".join(parts)

        # High protein + low carb
        if intent is not None and intent.min_protein is not None and intent.max_carbs is not None:
            ratio = protein / max(carbs, 1)
            if protein > carbs:
                parts.append(f"Strong protein-to-carb ratio ({ratio:.1f}:1)")
            parts.append(f"{protein:g}g protein with {carbs:g}g carbs")
            if carbs <= KETO_MAX_CARBS:
                parts.append("keto-friendly")
            return " • ".join(parts)

        # Protein focused
        if intent is not None and intent.min_protein is not None:
            if protein >= 50:
                parts.append(f"Very high protein ({protein:g}g)")
            elif protein >= 30:
                parts.append(f"High protein ({protein:g}g)")
            else:
                parts.append(f"{protein:g}g protein")

        # Carb focused — enforcement must be VISIBLE, and "only" is earned
        if intent is not None and intent.max_carbs is not None:
            if carbs <= KETO_MAX_CARBS:
                parts.append(f"only {carbs:g}g carbs • keto-friendly")
            elif carbs <= intent.max_carbs:
                parts.append(f"{carbs:g}g carbs — fits your low-carb target")
            else:
                parts.append(f"{carbs:g}g carbs")

        # Fat floor ("high fat") — say the number so the user knows it counted
        if intent is not None and intent.min_fat is not None:
            parts.append(f"{fat:g}g fat")

        if 'calor' in query_lower and not parts:
            parts.append(f"{calories} calories")

        # Nutritional summary if nothing specific matched
        if not parts:
            parts.append(f"{calories} cal • {protein:g}g protein • {carbs:g}g carbs")

        if recipe.restaurant_name:
            parts.append(f"from {recipe.restaurant_name}")

        return " • ".join(parts)
