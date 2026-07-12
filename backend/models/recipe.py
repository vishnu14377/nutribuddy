"""Recipe data models and schemas."""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
import uuid


def _clean_platform(v: Optional[str]) -> Optional[str]:
    v = (v or '').strip().lower()
    return v or None


class Recipe(BaseModel):
    """Recipe/Menu item model with nutritional information."""

    # Field validators also run on attribute assignment (e.g. currency
    # defaulting at the ingest boundary), not just construction.
    model_config = ConfigDict(validate_assignment=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    ingredients: List[str] = []
    cooking_method: Optional[str] = None
    cuisine_type: Optional[str] = None
    cooking_time: Optional[str] = None
    spice_level: Optional[str] = None
    dietary_tags: List[str] = []

    # Nutrition (estimated by AI if not provided)
    estimated_calories: Optional[int] = None
    estimated_protein: Optional[float] = None
    estimated_carbs: Optional[float] = None
    estimated_fat: Optional[float] = None

    # Delivery-platform fields
    image_url: Optional[str] = None
    restaurant_name: Optional[str] = None
    delivery_time: Optional[str] = None
    rating: Optional[float] = None
    # price is MAJOR currency units (12.99 == $12.99), rounded to 2dp at the
    # ingestion boundary. Revisit integer minor units only if price arithmetic
    # (carts, totals) ever ships.
    price: Optional[float] = None
    # ISO 4217 uppercase (e.g. "USD", "INR"); None = unknown source currency,
    # in which case the UI shows a bare number with no symbol.
    currency: Optional[str] = None
    # Which platform this item came from: ubereats | doordash | biterush | manual
    source_platform: str = "biterush"
    # Deep link to the dish/restaurant on the platform; None is expected for
    # scraped POC data (the frontend falls back to a search URL / copy-paste).
    order_url: Optional[str] = None
    uber_uuid: Optional[str] = None
    tags: Optional[str] = None
    # Restaurant location (for zipcode-based "near me" discovery)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    postal_code: Optional[str] = None

    @field_validator('currency')
    @classmethod
    def validate_currency(cls, v):
        if v is None or v == '':
            return None
        v = v.strip().upper()
        if len(v) != 3 or not v.isalpha():
            raise ValueError('currency must be a 3-letter ISO 4217 code')
        return v

    @field_validator('price')
    @classmethod
    def round_price(cls, v):
        return round(v, 2) if v is not None else None

    @field_validator('source_platform')
    @classmethod
    def normalize_platform(cls, v):
        return _clean_platform(v) or 'biterush'


class SearchQuery(BaseModel):
    """Search query model.

    Supports natural language queries like:
    - "high protein meal under 500 calories"
    - "spicy vegetarian dinner"
    - "pizza near me"
    - "30g protein low carb"
    """

    # Bounded so an oversized paste 422s cleanly instead of blowing up inside
    # the embedding call as a raw 500.
    query: str = Field(min_length=1, max_length=1000)
    filters: Optional[dict] = {}
    restaurant_name: Optional[str] = None   # narrow results to a specific restaurant
    source_platform: Optional[str] = None   # narrow results to one delivery platform
    zipcode: Optional[str] = None           # only deliverable results near here
    radius_km: float = 40

    @field_validator('source_platform')
    @classmethod
    def normalize_platform(cls, v):
        # Ingestion lowercases platform metadata; the search filter must match
        # ('UberEats' would otherwise silently return zero results).
        return _clean_platform(v)


class SearchResult(BaseModel):
    """Search result with match score and AI explanation.

    meets_constraints is False when nothing fully satisfied the parsed
    constraints and this item is a closest-option fallback — the UI must
    say so rather than presenting it as a match.
    """

    recipe: Recipe
    match_score: float
    match_explanation: str
    meets_constraints: bool = True
    # False when the query had no parseable constraints — the UI must not
    # assert "Fits your search" when there was nothing to fit.
    constrained: bool = False
    # Distance from the user's zipcode, when one was provided
    distance_km: Optional[float] = None
