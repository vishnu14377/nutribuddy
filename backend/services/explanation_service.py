"""Service for generating AI-powered recipe explanations."""

from typing import List, Optional
import re
from models.recipe import Recipe


class ExplanationService:
    """Service for generating why a recipe matches a search query."""
    
    @staticmethod
    def extract_nutrition_from_query(query: str) -> dict:
        """Extract nutrition requirements from query.
        
        Args:
            query: User's search query
            
        Returns:
            Dict with extracted nutrition values
        """
        requirements = {
            'max_calories': None,
            'min_calories': None,
            'min_protein': None,
            'max_carbs': None,
            'max_fat': None
        }
        
        query_lower = query.lower()
        
        # Extract calorie requirements
        cal_patterns = [
            r'under\s*(\d+)\s*cal',
            r'less\s*than\s*(\d+)\s*cal',
            r'below\s*(\d+)\s*cal',
            r'(\d+)\s*cal\s*or\s*less',
            r'max\s*(\d+)\s*cal',
            r'<\s*(\d+)\s*cal'
        ]
        for pattern in cal_patterns:
            match = re.search(pattern, query_lower)
            if match:
                requirements['max_calories'] = int(match.group(1))
                break
        
        # Extract protein requirements
        protein_patterns = [
            r'(\d+)g?\s*protein',
            r'at\s*least\s*(\d+)g?\s*protein',
            r'min\s*(\d+)g?\s*protein',
            r'>\s*(\d+)g?\s*protein'
        ]
        for pattern in protein_patterns:
            match = re.search(pattern, query_lower)
            if match:
                requirements['min_protein'] = int(match.group(1))
                break
        
        # High protein flag
        if 'high protein' in query_lower:
            requirements['min_protein'] = requirements['min_protein'] or 25
        
        # Low carb flag
        if 'low carb' in query_lower or 'keto' in query_lower:
            requirements['max_carbs'] = 30
        
        # Low fat flag
        if 'low fat' in query_lower:
            requirements['max_fat'] = 15
        
        return requirements
    
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
        
        # Extract user requirements
        requirements = ExplanationService.extract_nutrition_from_query(query)
        
        # Check calorie requirements
        if requirements['max_calories'] and recipe.estimated_calories:
            if recipe.estimated_calories <= requirements['max_calories']:
                explanation_parts.append(
                    f"Only {recipe.estimated_calories} calories (under your {requirements['max_calories']} cal limit)"
                )
            else:
                explanation_parts.append(
                    f"Contains {recipe.estimated_calories} calories"
                )
        elif 'calorie' in query_lower or 'cal' in query_lower:
            explanation_parts.append(
                f"Contains {recipe.estimated_calories} calories"
            )
        
        # Check protein requirements
        if requirements['min_protein'] and recipe.estimated_protein:
            if recipe.estimated_protein >= requirements['min_protein']:
                explanation_parts.append(
                    f"High protein: {recipe.estimated_protein}g (meets your {requirements['min_protein']}g goal)"
                )
        elif 'protein' in query_lower and recipe.estimated_protein:
            if recipe.estimated_protein >= 25:
                explanation_parts.append(f"High protein content: {recipe.estimated_protein}g")
            else:
                explanation_parts.append(f"Contains {recipe.estimated_protein}g protein")
        
        # Check carb requirements
        if requirements['max_carbs'] and recipe.estimated_carbs:
            if recipe.estimated_carbs <= requirements['max_carbs']:
                explanation_parts.append(
                    f"Low carb: only {recipe.estimated_carbs}g carbs"
                )
        elif 'low carb' in query_lower and recipe.estimated_carbs:
            if recipe.estimated_carbs < 30:
                explanation_parts.append(f"Low carb option: {recipe.estimated_carbs}g")
        
        # Check dietary preferences
        if 'vegetarian' in query_lower or 'veggie' in query_lower:
            if recipe.dietary_tags and 'Vegetarian' in recipe.dietary_tags:
                explanation_parts.append("Vegetarian-friendly")
        
        if 'vegan' in query_lower:
            if recipe.dietary_tags and 'Vegan' in recipe.dietary_tags:
                explanation_parts.append("100% vegan")
        
        if 'gluten' in query_lower:
            if recipe.dietary_tags and 'Gluten-Free' in recipe.dietary_tags:
                explanation_parts.append("Gluten-free option")
        
        # Check spice preferences
        if 'spicy' in query_lower or 'hot' in query_lower:
            if recipe.spice_level in ['Spicy', 'Very Spicy']:
                explanation_parts.append(f"Spice level: {recipe.spice_level}")
        elif 'mild' in query_lower or 'not spicy' in query_lower:
            if recipe.spice_level == 'Mild':
                explanation_parts.append("Mild and gentle on the palate")
        
        # Check cuisine match
        cuisine_keywords = ['indian', 'chinese', 'mexican', 'italian', 'thai', 'japanese', 
                           'korean', 'american', 'mediterranean', 'pizza', 'burger', 'sushi']
        for cuisine in cuisine_keywords:
            if cuisine in query_lower and recipe.cuisine_type:
                if cuisine.lower() in recipe.cuisine_type.lower():
                    explanation_parts.append(f"Authentic {recipe.cuisine_type} cuisine")
                    break
        
        # Restaurant mention
        if recipe.restaurant_name:
            explanation_parts.append(f"From {recipe.restaurant_name}")
        
        # Price value
        if 'cheap' in query_lower or 'budget' in query_lower or 'affordable' in query_lower:
            if recipe.price and recipe.price < 15:
                explanation_parts.append(f"Great value at ${recipe.price:.2f}")
        
        # Default explanation if nothing specific matched
        if not explanation_parts:
            default_parts = []
            if recipe.estimated_calories:
                default_parts.append(f"{recipe.estimated_calories} cal")
            if recipe.estimated_protein:
                default_parts.append(f"{recipe.estimated_protein}g protein")
            if recipe.cuisine_type:
                default_parts.append(recipe.cuisine_type)
            
            if default_parts:
                explanation_parts.append(
                    f"This {recipe.cuisine_type or 'delicious'} dish matches your search with " +
                    ', '.join(default_parts[:2])
                )
            else:
                explanation_parts.append(
                    f"Matches your search criteria for {query[:50]}"
                )
        
        return ". ".join(explanation_parts) + "."
