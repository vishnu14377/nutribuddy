"""Recipe data models and schemas."""

from pydantic import BaseModel, Field
from typing import List, Optional
import uuid


class Recipe(BaseModel):
    """Recipe model with nutritional information."""
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ingredients: List[str]
    cooking_method: str
    cuisine_type: str
    cooking_time: str
    spice_level: Optional[str] = None
    dietary_tags: List[str] = []
    estimated_calories: Optional[int] = None
    estimated_protein: Optional[float] = None
    estimated_carbs: Optional[float] = None
    estimated_fat: Optional[float] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    # Uber Eats specific fields
    restaurant_name: Optional[str] = None
    delivery_time: Optional[str] = None
    rating: Optional[float] = None
    price: Optional[float] = None


class SearchQuery(BaseModel):
    """Search query model."""
    
    query: str
    filters: Optional[dict] = {}


class SearchResult(BaseModel):
    """Search result with match score and explanation."""
    
    recipe: Recipe
    match_score: float
    match_explanation: str
