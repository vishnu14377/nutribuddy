"""Service for generating recipe match explanations."""

from typing import List
from models.recipe import Recipe


class ExplanationService:
    """Service for generating why a recipe matches a search query."""
    
    @staticmethod
    def generate_explanation(query: str, recipe: Recipe) -> str:
        """Generate explanation for why recipe matches query.
        
        Args:
            query: User's search query
            recipe: Matched recipe
            
        Returns:
            Human-readable explanation string
        """
        explanation_parts: List[str] = []
        query_lower = query.lower()
        
        # Check protein requirements
        if 'high protein' in query_lower or 'protein' in query_lower:
            if recipe.estimated_protein and recipe.estimated_protein > 20:
                explanation_parts.append(
                    f"High protein content ({recipe.estimated_protein}g)"
                )
        
        # Check carb requirements
        if 'low carb' in query_lower:
            if recipe.estimated_carbs and recipe.estimated_carbs < 30:
                explanation_parts.append(
                    f"Low in carbs ({recipe.estimated_carbs}g)"
                )
        
        # Check calorie information
        if 'calories' in query_lower or 'calorie' in query_lower:
            explanation_parts.append(
                f"Contains {recipe.estimated_calories} calories"
            )
        
        # Check dietary preferences
        if 'vegetarian' in query_lower or 'vegan' in query_lower:
            if recipe.dietary_tags:
                explanation_parts.append(
                    f"Dietary: {', '.join(recipe.dietary_tags)}"
                )
        
        # Check spice preferences
        if 'spicy' in query_lower:
            explanation_parts.append(
                f"Spice level: {recipe.spice_level}"
            )
        
        # Default explanation if no specific matches
        if not explanation_parts:
            explanation_parts.append(
                f"This {recipe.cuisine_type} dish matches your search criteria"
            )
            explanation_parts.append(
                f"with {recipe.estimated_calories} calories and "
                f"{recipe.estimated_protein}g protein"
            )
        
        return ". ".join(explanation_parts) + "."
