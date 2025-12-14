"""Recipe data models and schemas."""

from pydantic import BaseModel, Field
from typing import List, Optional
import uuid


class Recipe(BaseModel):
    """Recipe/Menu item model with nutritional information."""
    
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
    
    # Uber Eats specific fields
    image_url: Optional[str] = None
    restaurant_name: Optional[str] = None
    delivery_time: Optional[str] = None
    rating: Optional[float] = None
    price: Optional[float] = None
    uber_uuid: Optional[str] = None
    tags: Optional[str] = None


class SearchQuery(BaseModel):
    """Search query model.
    
    Supports natural language queries like:
    - "high protein meal under 500 calories"
    - "spicy vegetarian dinner"
    - "pizza near me"
    - "30g protein low carb"
    """
    
    query: str
    filters: Optional[dict] = {}


class SearchResult(BaseModel):
    """Search result with match score and AI explanation."""
    
    recipe: Recipe
    match_score: float
    match_explanation: str
