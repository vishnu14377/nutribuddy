"""Nutrition calculation service."""

import re
from typing import List, Dict


class NutritionService:
    """Service for calculating nutritional information from ingredients."""
    
    # Nutritional database (per 100g)
    NUTRITION_DB: Dict[str, Dict[str, float]] = {
        # Proteins
        'beef': {'calories': 250, 'protein': 26, 'carbs': 0, 'fat': 15},
        'chicken': {'calories': 165, 'protein': 31, 'carbs': 0, 'fat': 3.6},
        'lamb': {'calories': 294, 'protein': 25, 'carbs': 0, 'fat': 21},
        'pork': {'calories': 242, 'protein': 27, 'carbs': 0, 'fat': 14},
        'salmon': {'calories': 208, 'protein': 20, 'carbs': 0, 'fat': 13},
        'prawns': {'calories': 99, 'protein': 24, 'carbs': 0.2, 'fat': 0.3},
        'fish': {'calories': 206, 'protein': 22, 'carbs': 0, 'fat': 12},
        'eggs': {'calories': 155, 'protein': 13, 'carbs': 1.1, 'fat': 11},
        
        # Carbs
        'rice': {'calories': 130, 'protein': 2.7, 'carbs': 28, 'fat': 0.3},
        'pasta': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
        'bread': {'calories': 265, 'protein': 9, 'carbs': 49, 'fat': 3.2},
        'potato': {'calories': 77, 'protein': 2, 'carbs': 17, 'fat': 0.1},
        'noodles': {'calories': 138, 'protein': 4.5, 'carbs': 25, 'fat': 2.1},
        
        # Vegetables
        'tomato': {'calories': 18, 'protein': 0.9, 'carbs': 3.9, 'fat': 0.2},
        'onion': {'calories': 40, 'protein': 1.1, 'carbs': 9.3, 'fat': 0.1},
        'carrot': {'calories': 41, 'protein': 0.9, 'carbs': 10, 'fat': 0.2},
        'pepper': {'calories': 20, 'protein': 0.9, 'carbs': 4.6, 'fat': 0.2},
        'broccoli': {'calories': 55, 'protein': 3.7, 'carbs': 11, 'fat': 0.6},
        'spinach': {'calories': 23, 'protein': 2.9, 'carbs': 3.6, 'fat': 0.4},
        'mushroom': {'calories': 22, 'protein': 3.1, 'carbs': 3.3, 'fat': 0.3},
        
        # Legumes
        'lentils': {'calories': 116, 'protein': 9, 'carbs': 20, 'fat': 0.4},
        'chickpeas': {'calories': 164, 'protein': 8.9, 'carbs': 27, 'fat': 2.6},
        'beans': {'calories': 127, 'protein': 8.7, 'carbs': 23, 'fat': 0.5},
        
        # Fats
        'oil': {'calories': 120, 'protein': 0, 'carbs': 0, 'fat': 14},
        'butter': {'calories': 102, 'protein': 0.1, 'carbs': 0.01, 'fat': 11.5},
        'cheese': {'calories': 402, 'protein': 25, 'carbs': 1.3, 'fat': 33},
        'cream': {'calories': 340, 'protein': 2.2, 'carbs': 2.8, 'fat': 37},
        'coconut milk': {'calories': 230, 'protein': 2.3, 'carbs': 6, 'fat': 24},
    }
    
    @staticmethod
    def calculate_nutrition(ingredients: List[str], servings: int = 2) -> Dict[str, float]:
        """Calculate estimated nutrition from ingredients.
        
        Args:
            ingredients: List of ingredient strings
            servings: Number of servings (default: 2)
            
        Returns:
            Dictionary with calories, protein, carbs, and fat per serving
        """
        total_cal = 0.0
        total_protein = 0.0
        total_carbs = 0.0
        total_fat = 0.0
        
        for ingredient in ingredients:
            ingredient_lower = ingredient.lower()
            
            for key, values in NutritionService.NUTRITION_DB.items():
                if key in ingredient_lower:
                    # Extract quantity if present (e.g., "500g chicken")
                    quantity_match = re.search(r'(\d+)\s*g', ingredient_lower)
                    multiplier = 1.0
                    
                    if quantity_match:
                        grams = int(quantity_match.group(1))
                        multiplier = grams / 100
                    
                    total_cal += values['calories'] * multiplier
                    total_protein += values['protein'] * multiplier
                    total_carbs += values['carbs'] * multiplier
                    total_fat += values['fat'] * multiplier
                    break
        
        return {
            'calories': int(total_cal / servings),
            'protein': round(total_protein / servings, 1),
            'carbs': round(total_carbs / servings, 1),
            'fat': round(total_fat / servings, 1)
        }
