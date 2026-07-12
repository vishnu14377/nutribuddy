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


def protein_of(recipe) -> float:
    return recipe.estimated_protein or 0

# Below this cosine similarity, results are noise — better an honest empty
# state than a page of 17%-match filler (scores in practice top out ~0.62).
RELEVANCE_FLOOR = 0.25
# Between the floors, an item may still be worth showing but must NOT carry
# the green "fits" badge — soup is not a verified match for "dessert".
SOFT_RELEVANCE_FLOOR = 0.30
# At most this many un-orderable partner items per result page, always ranked
# below orderable matches.
MAX_UNORDERABLE_RESULTS = 2

# Items above this are almost certainly multi-serving (family meals, whole
# catering trays) and are excluded from single-meal nutrition queries.
SINGLE_MEAL_CALORIE_CEILING = 1400

MULTI_SERVING_NAME_RE = re.compile(
    r'family|meal deal|party pack|party size|bundle|2 liter|2-liter|'
    r'\(\s*\d+\s*servings?\s*\)|whole p(?:ie|izza)|1[4-9]\s?(?:\"|inch|\'\')', re.IGNORECASE
)

MEAT_WORDS_RE = re.compile(
    r'chicken|beef|steak|lamb|pork|bacon|ham\b|turkey|salmon|tuna|shrimp|prawn|'
    r'fish|crab|gyro|kofta|meatball|pepperoni|sausage|chorizo|brisket|ribs?\b|'
    r'wings?\b|carnitas|pastrami|prosciutto|anchov|nuggets?\b|duck|veal|lobster|'
    r'calamari|squid|oysters?\b|clams?\b|scallops?\b|burgers?\b|gumbo|milanese|schnitzel|'
    r'mortadella|soppressata|salami|bologna|capicola|prosciutto|pancetta|chorizo|'
    r'b\.m\.t|blt\b|cold cut|goat|bison|venison|oxtail|pork grind|chicharr', re.IGNORECASE
    # 'burger' counts as meat: real veggie burgers carry a vegetarian tag,
    # which is checked BEFORE this regex — an untagged ShackBurger must never
    # reach vegetarian results, even amber-flagged. Meat-implying dish names
    # (gumbo, milanese, schnitzel) count too.
)

# Platforms with a working order handoff. Items from other sources rank in a
# lower tier and are capped per page — a Top Pick the user cannot buy breaks
# the product's core promise. biterush is first-party (the BiteRush app lives
# in biterush/ in this monorepo) and hands off via /food/<id> deep links.
ORDERABLE_PLATFORMS = {'ubereats', 'doordash', 'biterush'}


def _is_orderable(candidate: Dict) -> bool:
    return (candidate.get('metadata', {}).get('platform', '') or '') in ORDERABLE_PLATFORMS


# Dish-type nouns: when the query names a dish, an item that isn't that dish
# never earns the green badge — a brownie is not a "low calorie pizza".
# Synonyms count in BOTH directions: a 'Veggie Shack' (patty) earns the
# burger badge; 'grilled chicken' never green-badges a bacon cheeseburger.
DISH_SYNONYMS = {
    'burger': ('burger', 'patty', 'smash'),
    'pizza': ('pizza', 'pie', 'margherita', 'calzone'),
    'bowl': ('bowl', 'plate'),
    'salad': ('salad', 'greens'),
    'sandwich': ('sandwich', 'sub', 'hoagie', 'panini', 'melt', 'club'),
    'dessert': ('dessert', 'brownie', 'cookie', 'cake', 'sundae', 'ice cream',
                'donut', 'cheesecake', 'pudding', 'sweet'),
}

DISH_NOUNS = (
    'pizza', 'burger', 'taco', 'burrito', 'sushi', 'pad thai', 'noodle',
    'pasta', 'salad', 'sandwich', 'wrap', 'wings', 'soup', 'dessert',
    'pancake', 'omelette', 'omelet', 'kebab', 'shake', 'smoothie', 'poke',
    'paneer', 'tofu', 'falafel', 'gyro', 'sub ', 'shawarma', 'curry', 'ramen',
    'bowl', 'plate',
)
# Beverages never "fit" a meal/dish/snack query; sweets never fit MEALS but
# absolutely fit dessert queries (round 7: the only sweets were blocked from
# 'dessert' while sparkling water passed as a 'meal').
BEVERAGE_RE = re.compile(
    r'soda|cola|snapple|ramune|juice\b|lemonade|milkshakes?|shakes?\b|smoothie|'
    r'spindrift|sparkling|seltzer|\btea\b|\bwater\b|\d+\s*oz\b|sprite|'
    r'soft drink|lassi|kombucha|espresso|latte|cappuccino|slush|red bull|monster energy|gatorade|frappe', re.IGNORECASE
)
# "Add Texas Toast" / sides are add-ons, not lunches
ADDON_RE = re.compile(r'^add\s|\bside\b|^extra\s', re.IGNORECASE)
SWEETS_RE = re.compile(
    r'brownie|cookie|cake\b|donut|ice cream|candy|sundae|pudding|cheesecake', re.IGNORECASE
)
DRINK_QUERY_WORDS = ('shake', 'smoothie', 'drink', 'juice', 'coffee', 'tea', 'latte')
MEAL_WORDS = ('breakfast', 'lunch', 'dinner', 'meal', 'entree', 'snack')

# Bare 'protein' is a topic, not a numeric ask — only phrases set the 30g gate
PROTEIN_TERMS = (
    'high protein', 'protein rich', 'protein-rich', 'high-protein',
    'lots of protein', 'more protein', 'protein heavy', 'hi protien',
    'high protien', 'alta en proteina',
)
LOW_CARB_TERMS = (
    'low carb', 'low-carb', 'low carbs', 'lo carb', 'fewer carbs', 'less carbs',
    'keto', 'no carbs', 'baja en carb', 'bajo en carb', 'sin carb',
)
STRICT_KETO_TERMS = ('keto',)
NO_BREAD_TERMS = ('no bread', 'without bun', 'without bread')
# Canonical keto phrasings that don't say "keto" — same strict 15g discipline
# ('bunless burger' returning a 20g item as a green match is a trust leak).
KETO_PHRASINGS = ('keto', 'bunless', 'no bun', 'lettuce wrap', 'low carb high fat', 'lchf')
VEGETARIAN_TERMS = ('vegetarian', 'meatless', 'plant based', 'plant-based', 'no meat', 'veggie', 'vegetariano')
VEGAN_TERMS = ('vegan', 'vegano')
# Naming an unambiguously vegetarian dish implies the dietary constraint —
# 'paneer butter masala' must never return a gyro bowl.
VEGETARIAN_DISH_TERMS = (
    'paneer', 'tofu', 'tempeh', 'seitan', 'falafel', 'dal ', 'daal', 'chana',
    'saag', 'halloumi', 'aloo gobi', 'palak',
)
# 'diet' is deliberately absent: it's a diet-TYPE word ("keto diet") — round-5
# found it imposing a phantom 500-cal cap that overrode users' stated targets.
LOW_CAL_INTENT_TERMS = ('low cal', 'low-cal', 'light', 'healthy')
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
    excluded_terms: tuple = () # "no rice" / "without mayo" — hard name/description exclusions
    cleaned_query: str = ''    # query with exclusion phrases stripped, for embedding

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


_NUMBER_UNITS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
    'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
    'nineteen': 19,
}
_NUMBER_TENS = {
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
    'seventy': 70, 'eighty': 80, 'ninety': 90,
}

# Excluded-food candidates that dedicated intents already handle better.
_EXCLUSION_SKIP = {'meat', 'carb', 'carbs', 'bread', 'bun', 'buns'}

_EXCLUSION_RE = re.compile(r'\b(?:no|without)\s+([a-z]+)')


def _normalize_number_words(text: str) -> str:
    """'six hundred calories' -> '600 calories'; 'forty grams' -> '40 grams'."""
    tens_pat = '|'.join(_NUMBER_TENS)
    units_pat = '|'.join(_NUMBER_UNITS)

    def hundreds(m):
        value = _NUMBER_UNITS[m.group(1)] * 100
        if m.group(2):
            value += _NUMBER_TENS.get(m.group(2), _NUMBER_UNITS.get(m.group(2), 0))
        if m.group(3):
            value += _NUMBER_UNITS.get(m.group(3), 0)
        return str(value)

    text = re.sub(
        rf'\b({units_pat})\s+hundred(?:\s+and)?(?:\s+({tens_pat}|{units_pat}))?(?:[\s-]({units_pat}))?\b',
        hundreds, text)
    text = re.sub(
        rf'\b({tens_pat})[\s-]({units_pat})\b',
        lambda m: str(_NUMBER_TENS[m.group(1)] + _NUMBER_UNITS[m.group(2)]), text)
    text = re.sub(rf'\b({tens_pat})\b', lambda m: str(_NUMBER_TENS[m.group(1)]), text)
    text = re.sub(rf'\b({units_pat})\b(?=\s*(?:hundred|k?cal|calorie|gram|g\b|dollar|buck))',
                  lambda m: str(_NUMBER_UNITS[m.group(1)]), text)
    return text


def parse_intent(query: str) -> QueryIntent:
    """Parse nutrition/price constraints from a plain-English query.

    Extraction order matters: gram-level macro limits and dollar limits are
    matched and REMOVED from the working string first, so the bare calorie
    pattern ("under 400") can never swallow "under 15g carbs" or "under $12".
    Spelled-out numbers are normalized first ("six hundred calories" == "600
    calories") — silently ignoring them while green-badging violators was a
    round-3 trust failure.
    """
    intent = QueryIntent()
    work = _normalize_number_words(query.lower())

    # Exclusions ("no rice", "without mayo") become hard filters AND are
    # stripped from the embedding text — otherwise "no rice" pulls rice bowls
    # CLOSER in embedding space.
    excluded = []
    cleaned = query
    for m in _EXCLUSION_RE.finditer(work):
        term = m.group(1)
        if term not in _EXCLUSION_SKIP and len(term) > 2:
            excluded.append(term)
            cleaned = re.sub(rf'\b(?:no|without)\s+{term}\b', ' ', cleaned, flags=re.IGNORECASE)
    intent.excluded_terms = tuple(excluded)
    intent.cleaned_query = ' '.join(cleaned.split())

    # Daily goals ("180g protein a day") are NOT per-dish floors — strip them
    # before constraint extraction so a satisfiable ask isn't zeroed out.
    work = re.sub(r'\d+(?:\.\d+)?\s*g(?:rams?)?\s*(?:of\s*)?(?:protein|carbs?|fat)\s*(?:a|per)\s*day', ' ', work)
    work = re.sub(r'\d+\s*k?cal(?:orie)?s?\s*(?:a|per)\s*day', ' ', work)
    work = re.sub(r'daily\s+(?:goal|target|intake)\s*(?:of\s*)?\d+\s*\w*', ' ', work)

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
    # Budget arithmetic first: "1400 calories a day ... ate/had 1000" -> 400
    m = re.search(r'(\d+)\s*k?cal(?:orie)?s?\s*(?:a|per)\s*day.*?(?:ate|had|consumed|eaten)\s*(?:about\s*)?(\d+)', work)
    if m and int(m.group(1)) > int(m.group(2)):
        intent.calorie_limit = int(m.group(1)) - int(m.group(2))

    calorie_patterns = [
        r'(\d+)\s*k?cal(?:orie)?s?\s*(?:left|remaining|to\s*spare)',
        r'(?:only\s*)?have\s*(\d+)\s*k?cal(?:orie)?s?\b',
        r'(?:under|below|less\s*than|max(?:imum)?)\s*(\d+)\s*(?:k?cal(?:orie)?s?)',
        r'(\d+)\s*(?:k?cal(?:orie)?s?)\s*(?:or\s*less|or\s*under|max(?:imum)?)',
        r'<\s*(\d+)\s*(?:k?cal(?:orie)?s?)?',
        r'(\d+)\s*calorie\b',          # "300 calorie lunch"
        r'(?:under|below)\s*(\d+)\b',  # bare "under 400" (macros/$ already removed)
    ]
    for pattern in calorie_patterns:
        if intent.calorie_limit is not None:
            break
        m = re.search(pattern, work)
        if m:
            limit = int(m.group(1))
            if limit <= 0:
                intent.impossible = True
            else:
                intent.calorie_limit = limit
            break

    # "around/about 700 calories" is a target, not a cap — allow ~15% headroom
    if intent.calorie_limit is None and not intent.impossible:
        m = re.search(r'(?:around|about|roughly|~)\s*(\d+)\s*k?cal(?:orie)?s?', work)
        if m and int(m.group(1)) > 0:
            intent.calorie_limit = int(int(m.group(1)) * 1.15)

    # Only infer a generic light-meal cap when the user gave NO calorie figure
    if intent.calorie_limit is None and not intent.impossible \
            and not re.search(r'\d+\s*k?cal', work):
        if any(term in work for term in LOW_CAL_INTENT_TERMS):
            intent.calorie_limit = GENERAL_LOW_CAL_LIMIT

    # Zero-valued limits are impossible asks, never divisors ("under $0",
    # "0g carbs" crashed the fallback path with ZeroDivisionError in round 5)
    for attr in ('max_carbs', 'max_fat', 'price_limit'):
        val = getattr(intent, attr)
        if val is not None and val <= 0:
            intent.impossible = True
            setattr(intent, attr, None)
    if intent.min_protein is not None and intent.min_protein <= 0:
        intent.min_protein = None

    # 4. Protein/carb keyword intents (only when no explicit number given)
    if intent.min_protein is None and any(t in work for t in PROTEIN_TERMS):
        intent.min_protein = DEFAULT_MIN_PROTEIN
    if intent.max_carbs is None:
        if any(t in work for t in KETO_PHRASINGS):
            intent.max_carbs = KETO_MAX_CARBS
        elif any(t in work for t in NO_BREAD_TERMS):
            intent.max_carbs = NO_BREAD_MAX_CARBS
        elif any(t in work for t in LOW_CARB_TERMS):
            intent.max_carbs = LOW_CARB_MAX_CARBS

    # 5. Fat floor ("high fat" — the other half of keto)
    if intent.min_fat is None and any(t in work for t in HIGH_FAT_TERMS):
        intent.min_fat = DEFAULT_MIN_FAT

    # 6. Dietary intents — explicit keywords, or naming an unambiguously
    # vegetarian dish (paneer, tofu, falafel...)
    if any(t in work for t in VEGAN_TERMS):
        intent.vegan = True
        intent.vegetarian = True
    elif any(t in work for t in VEGETARIAN_TERMS) or any(t in work for t in VEGETARIAN_DISH_TERMS):
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

        # Embed the exclusion-stripped query ("no rice" must not pull rice
        # bowls closer); boost relevance with the restaurant name if given.
        embed_query = intent.cleaned_query or query
        search_query = f"{embed_query} at {restaurant_filter}" if restaurant_filter else embed_query

        # Constraint-aware retrieval: numeric constraints join the Pinecone
        # metadata filter so tight caps search the WHOLE catalog's compliant
        # subset, not just the semantic top-75 ('300 calorie lunch' must find
        # the 280-cal salad even if it doesn't embed near 'lunch').
        pool_size = 75 if intent.has_any_constraint() else 50
        filters = {}
        if platform_filter:
            filters['platform'] = platform_filter
        if intent.calorie_limit is not None:
            filters['max_calories'] = intent.calorie_limit
        if intent.max_carbs is not None:
            filters['max_carbs'] = intent.max_carbs
        if intent.min_protein is not None:
            filters['min_protein'] = intent.min_protein
        candidates = self.vector_service.search(search_query, top_k=pool_size, filters=filters or None)
        if not candidates and filters and len(filters) > (1 if platform_filter else 0):
            # Nothing satisfies the caps — refetch unfiltered so the honest
            # closest-option fallback still has a pool to draw from.
            base = {'platform': platform_filter} if platform_filter else None
            candidates = self.vector_service.search(search_query, top_k=pool_size, filters=base)
        logger.info(f"Vector search returned {len(candidates)} candidates")

        if not candidates:
            return []

        # Restaurant narrowing (fuzzy, post-filter). A filter that matches
        # nothing returns an honest empty set — never other restaurants' food.
        if restaurant_filter:
            restaurant_lower = restaurant_filter.lower()
            candidates = [
                c for c in candidates
                if restaurant_lower in (c.get('metadata', {}).get('restaurant', '') or '').lower()
            ]
            if not candidates:
                logger.info(f"No candidates at restaurant '{restaurant_filter}' — honest empty result")
                return []

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
            if len(pool) < 3:
                # The semantic top-75 may simply not contain tagged items —
                # widen from the DB by tag so dietary users get the same
                # closest-option fallback everyone else gets.
                tag = 'vegan' if intent.vegan else 'vegetarian'
                seen = {c['id'] for c in pool}
                for row in self.db_service.get_recipes_by_tag(tag, limit=40):
                    if row['id'] in seen:
                        continue
                    pool.append({'id': row['id'], 'score': 0.32, 'metadata': {
                        'name': row.get('name', ''), 'description': row.get('description') or '',
                        'calories': row.get('estimated_calories') or 0,
                        'protein': row.get('estimated_protein') or 0,
                        'carbs': row.get('estimated_carbs') or 0,
                        'fat': row.get('estimated_fat') or 0,
                        'price': row.get('price') or 0,
                        'currency': row.get('currency') or '',
                        'dietary_tags': ','.join(row.get('dietary_tags') or []),
                        'platform': row.get('source_platform') or '',
                    }})
            if not pool:
                logger.info("No vegetarian/vegan matches — honest empty result")
                return []
        else:
            pool = candidates

        qualified = [c for c in pool if self._passes(c, intent)]

        # Dish-type / drink gates run BEFORE ranking so green results always
        # precede amber ones on the page (round 5: French Fries outranked the
        # only true paneer match because gating happened after ranking).
        query_lower_full = query.lower()
        named_dishes = [n for n in DISH_NOUNS if n in query_lower_full]
        has_meal_word = any(w in query_lower_full for w in MEAL_WORDS)

        def dish_gate_ok(c) -> bool:
            md = c.get('metadata', {})
            # Cuisine deliberately excluded: a pizzeria brownie is not pizza
            text = f"{md.get('name', '')} {md.get('description', '')}".lower()
            if named_dishes:
                terms = []
                for n in named_dishes:
                    terms.extend(DISH_SYNONYMS.get(n, (n,)))
                if not any(t in text for t in terms):
                    return False
            wants_drink = any(w in query_lower_full for w in DRINK_QUERY_WORDS)
            if (has_meal_word or named_dishes) and not wants_drink and BEVERAGE_RE.search(text):
                return False
            if has_meal_word and 'dessert' not in query_lower_full and SWEETS_RE.search(text):
                return False
            if has_meal_word and ADDON_RE.search(md.get('name', '') or ''):
                return False
            return True

        # Each entry is (candidate, base_meets, dish_mismatch). Ranking rules:
        # - green (constraints + dish type): orderable first, score within
        #   tiers, partner items capped but guaranteed page slots
        # - dish mismatches (constraints pass, different dish): after green
        # - thin orderable greens (<3): labeled near-misses instead of a cliff
        # - full fallback: closest-first ordering, never re-sorted by score
        def diet_verified(c) -> bool:
            if not (intent.vegetarian or intent.vegan):
                return True
            tags = (c.get('metadata', {}).get('dietary_tags', '') or '').lower()
            return ('vegan' in tags) if intent.vegan else ('vegetarian' in tags or 'vegan' in tags)

        explicit_no_meat = any(t in query.lower() for t in ('no meat', 'meatless', 'without meat'))
        if explicit_no_meat:
            # 'no meat' is a hard ask: unverified items don't surface at all
            qualified = [c for c in qualified if diet_verified(c)]

        if qualified:
            green = [c for c in qualified if dish_gate_ok(c) and diet_verified(c)]
            unverified = [c for c in qualified if dish_gate_ok(c) and not diet_verified(c)]
            mismatched = [c for c in qualified if not dish_gate_ok(c)]
            if intent.value_seek:
                ranked = [(c, True, False) for c in self._rank_by_value(green, intent)]
            else:
                ranked = [(c, True, False) for c in self._rank_and_cap(green)]
            ranked += [(c, False, False) for c in
                       sorted(unverified, key=lambda c: c['score'], reverse=True)]
            ranked += [(c, False, True) for c in
                       sorted(mismatched, key=lambda c: c['score'], reverse=True)]
            if (len([c for c in green if _is_orderable(c)]) < 3
                    and intent.has_any_constraint() and not intent.value_seek):
                qualified_ids = {c['id'] for c in qualified}
                remainder = [c for c in pool if c['id'] not in qualified_ids]
                orderable_remainder = [c for c in remainder if _is_orderable(c)]
                extras = self._closest_fallback(orderable_remainder or remainder, intent)
                ranked += [(c, False, False) for c in extras[:3]]
        elif intent.has_any_constraint():
            ranked = [(c, False, False) for c in self._closest_fallback(pool, intent)]
            logger.info(f"No items satisfy {intent.constraint_labels()} — returning {len(ranked)} closest, flagged")
        else:
            green = [c for c in pool if dish_gate_ok(c)]
            mismatched = [c for c in pool if not dish_gate_ok(c)]
            ranked = [(c, True, False) for c in self._rank_and_cap(green)]
            ranked += [(c, False, True) for c in
                       sorted(mismatched, key=lambda c: c['score'], reverse=True)]

        # Dedup + batch fetch (avoids N+1 queries)
        top_results = []
        seen_ids = set()
        for result, base_meets, dish_mismatch in ranked[:top_k]:
            if result['id'] not in seen_ids:
                seen_ids.add(result['id'])
                top_results.append((result, base_meets, dish_mismatch))

        recipe_docs = self.db_service.get_recipes_by_ids([r['id'] for r, _, _ in top_results])
        recipes_dict = {doc['id']: doc for doc in recipe_docs}

        final_results = []
        for result, base_meets, dish_mismatch in top_results:
            recipe_doc = recipes_dict.get(result['id'])
            if not recipe_doc:
                continue
            recipe = Recipe(**recipe_doc)
            item_meets = base_meets
            unverified_diet = False

            # Belt-and-suspenders diet safety: metadata descriptions are
            # truncated, so re-verify against the full stored description.
            if intent.vegetarian or intent.vegan:
                tags = ' '.join(recipe.dietary_tags or []).lower()
                tagged = ('vegan' in tags) if intent.vegan else ('vegetarian' in tags or 'vegan' in tags)
                if not tagged:
                    if intent.vegan or MEAT_WORDS_RE.search(f"{recipe.name} {recipe.description or ''}"):
                        logger.warning(f"Diet-safety drop: {recipe.name} (untagged, meat words in description)")
                        continue
                    # No meat words, but no positive tag either — never assert
                    # a verified dietary match on absence of evidence.
                    item_meets = False
                    unverified_diet = True

            # Excluded terms re-verified against the full description
            if intent.excluded_terms:
                haystack = f"{recipe.name} {recipe.description or ''}".lower()
                if any(term in haystack for term in intent.excluded_terms):
                    logger.info(f"Exclusion drop: {recipe.name} (contains excluded term)")
                    continue

            # Low semantic relevance never earns the green badge — soup is not
            # a verified match for "dessert" just because macros are fine.
            if item_meets and result['score'] < SOFT_RELEVANCE_FLOOR:
                item_meets = False

            if dish_mismatch:
                # Constraints passed but it's a different dish than asked for —
                # say exactly that instead of implying a constraint miss.
                item_meets = False
                explanation = ExplanationService.generate_explanation(
                    query, recipe, intent=intent, meets_constraints=True
                )
                suffix = " — fits your other limits" if intent.has_any_constraint() else ""
                explanation = f"Different dish than you searched{suffix} • {explanation}"
            else:
                explanation = ExplanationService.generate_explanation(
                    query, recipe, intent=intent, meets_constraints=item_meets
                )
            if unverified_diet:
                diet_word = 'vegan' if intent.vegan else 'vegetarian'
                explanation = f"{diet_word.capitalize()} status unverified — may contain meat, check with the restaurant • {explanation}"
            if recipe.source_platform not in ORDERABLE_PLATFORMS:
                explanation = f"{explanation} • partner preview — ordering coming soon"

            # Value queries surface the actual value math; huge portions get
            # named instead of cherry-picking one good macro.
            md_price = recipe.price or 0
            if intent.value_seek and recipe.currency == 'USD' and md_price > 0 and protein_of(recipe) > 0:
                explanation = f"{explanation} • {protein_of(recipe) / md_price:.1f}g protein per $"
            if intent.min_protein is not None and intent.calorie_limit is None \
                    and (recipe.estimated_calories or 0) >= 800:
                explanation = f"{explanation} • hearty {recipe.estimated_calories}-cal portion"

            final_results.append({
                'recipe': recipe,
                'match_score': result['score'],
                'match_explanation': explanation,
                'meets_constraints': item_meets,
                'constrained': intent.has_any_constraint(),
            })

        logger.info(f"Returning {len(final_results)} results")
        return final_results

    @staticmethod
    def _rank_and_cap(candidates: List[Dict], page_size: int = 10) -> List[Dict]:
        """Orderable items first (vector score within the tier), with up to
        MAX_UNORDERABLE_RESULTS partner items guaranteed slots at the END of
        the first page — capped so they can't hog the top, but on the page so
        the best partner match (often the best overall match) stays findable."""
        def is_orderable(c):
            return (c.get('metadata', {}).get('platform', '') or '') in ORDERABLE_PLATFORMS

        orderable = sorted((c for c in candidates if is_orderable(c)),
                           key=lambda c: c['score'], reverse=True)
        partner = sorted((c for c in candidates if not is_orderable(c)),
                         key=lambda c: c['score'], reverse=True)[:MAX_UNORDERABLE_RESULTS]

        head_len = max(0, page_size - len(partner))
        return orderable[:head_len] + partner + orderable[head_len:]

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
            # max(limit, 0.01): belt-and-suspenders — zero limits are filtered
            # at parse time, but a divisor of zero must never 502 the endpoint
            total = 0.0
            if intent.calorie_limit is not None:
                total += max(0, md(c, 'calories') - intent.calorie_limit) / max(intent.calorie_limit, 0.01)
            if intent.max_carbs is not None:
                total += max(0, md(c, 'carbs') - intent.max_carbs) / max(intent.max_carbs, 0.01)
            if intent.min_protein is not None:
                total += max(0, intent.min_protein - md(c, 'protein')) / max(intent.min_protein, 0.01)
            if intent.min_fat is not None:
                total += max(0, intent.min_fat - md(c, 'fat')) / max(intent.min_fat, 0.01)
            if intent.max_fat is not None:
                total += max(0, md(c, 'fat') - intent.max_fat) / max(intent.max_fat, 0.01)
            if intent.price_limit is not None:
                if md(c, 'currency', '') == 'USD' and md(c, 'price') > 0:
                    total += max(0, md(c, 'price') - intent.price_limit) / max(intent.price_limit, 0.01)
                else:
                    total += 1.0  # unpriced/foreign items are far from a budget ask
            return total

        # Items missing a limit by >50% are noise, not fallbacks (an 80g-carb
        # item under a 15g keto cap helps nobody) — better a shorter list
        near = [c for c in pool if shortfall(c) <= 0.5] or pool[:2]
        return sorted(near, key=lambda c: (shortfall(c), -c['score']))[:5]


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

        # Calorie-focused queries ("light" is earned under 400, not 490)
        if intent is not None and intent.calorie_limit is not None:
            if calories < 300:
                parts.append(f"Very light at {calories} calories")
            elif calories < 400:
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
            if 'keto-friendly' in (t.lower() for t in (recipe.dietary_tags or [])):
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

        # Carb focused — enforcement must be VISIBLE, "only" is earned, and
        # "keto-friendly" is a TAG claim, never inferred from carbs alone
        if intent is not None and intent.max_carbs is not None:
            has_keto_tag = 'keto-friendly' in (t.lower() for t in (recipe.dietary_tags or []))
            if carbs <= KETO_MAX_CARBS and has_keto_tag:
                parts.append(f"only {carbs:g}g total carbs • keto-friendly")
            elif carbs <= KETO_MAX_CARBS:
                parts.append(f"only {carbs:g}g total carbs")
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
