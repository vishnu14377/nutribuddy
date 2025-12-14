"""Data ingestion service for Uber Eats menu items."""

import pandas as pd
import json
import uuid
import re
from typing import List, Dict, Any, Optional
import google.generativeai as genai


class DataIngestionService:
    """Service for extracting and processing Uber Eats data."""
    
    # Generalized calorie estimates for common food categories
    CALORIE_ESTIMATES = {
        # Pizza
        'pizza': {'base': 250, 'per_slice': True, 'keywords': ['pizza', 'pie']},
        'pizza_whole': {'base': 2000, 'per_slice': False, 'keywords': ['whole pizza', 'large pizza', '20 inch', '18 inch']},
        
        # Burgers & Sandwiches
        'burger': {'base': 550, 'keywords': ['burger', 'hamburger', 'cheeseburger']},
        'sandwich': {'base': 450, 'keywords': ['sandwich', 'sub', 'hoagie', 'wrap', 'panini']},
        'hotdog': {'base': 300, 'keywords': ['hot dog', 'hotdog', 'dog']},
        
        # Chicken
        'fried_chicken': {'base': 400, 'keywords': ['fried chicken', 'chicken wings', 'wings', 'nuggets', 'tenders', 'strips']},
        'grilled_chicken': {'base': 350, 'keywords': ['grilled chicken', 'chicken breast', 'chicken salad']},
        'chicken_dish': {'base': 500, 'keywords': ['chicken']},
        
        # Pasta & Italian
        'pasta': {'base': 650, 'keywords': ['pasta', 'spaghetti', 'fettuccine', 'penne', 'lasagna', 'ravioli', 'macaroni']},
        'risotto': {'base': 550, 'keywords': ['risotto']},
        
        # Asian
        'stir_fry': {'base': 450, 'keywords': ['stir fry', 'stir-fry', 'lo mein', 'chow mein', 'fried rice']},
        'sushi_roll': {'base': 350, 'keywords': ['sushi', 'roll', 'maki']},
        'ramen': {'base': 500, 'keywords': ['ramen', 'pho', 'noodle soup']},
        'curry': {'base': 550, 'keywords': ['curry', 'tikka masala', 'korma']},
        'rice_bowl': {'base': 550, 'keywords': ['rice bowl', 'bowl', 'bibimbap', 'poke']},
        
        # Mexican
        'burrito': {'base': 700, 'keywords': ['burrito']},
        'taco': {'base': 200, 'keywords': ['taco']},
        'quesadilla': {'base': 500, 'keywords': ['quesadilla']},
        'nachos': {'base': 600, 'keywords': ['nachos']},
        
        # Seafood
        'fish': {'base': 400, 'keywords': ['fish', 'salmon', 'tuna', 'tilapia', 'cod', 'shrimp', 'seafood']},
        
        # Salads
        'salad': {'base': 350, 'keywords': ['salad']},
        
        # Sides
        'fries': {'base': 350, 'keywords': ['fries', 'french fries', 'chips']},
        'side': {'base': 200, 'keywords': ['side', 'appetizer', 'starter']},
        
        # Breakfast
        'breakfast': {'base': 450, 'keywords': ['breakfast', 'eggs', 'pancake', 'waffle', 'omelette', 'omelet']},
        
        # Desserts
        'dessert': {'base': 400, 'keywords': ['dessert', 'cake', 'pie', 'ice cream', 'brownie', 'cookie', 'cheesecake']},
        
        # Drinks
        'drink': {'base': 150, 'keywords': ['drink', 'soda', 'juice', 'smoothie', 'shake', 'coffee', 'tea']},
        
        # Default
        'default': {'base': 500, 'keywords': []}
    }
    
    # Protein estimates (grams)
    PROTEIN_ESTIMATES = {
        'high_protein': {'base': 35, 'keywords': ['chicken', 'steak', 'beef', 'fish', 'salmon', 'shrimp', 'protein', 'grilled']},
        'medium_protein': {'base': 20, 'keywords': ['burger', 'sandwich', 'pizza', 'pasta', 'burrito', 'bowl']},
        'low_protein': {'base': 8, 'keywords': ['salad', 'side', 'fries', 'vegetable', 'vegan', 'vegetarian']},
        'default': {'base': 15}
    }
    
    @staticmethod
    def estimate_calories(title: str, description: str = '') -> int:
        """Estimate calories based on menu item name and description.
        
        Args:
            title: Menu item title
            description: Item description
            
        Returns:
            Estimated calories
        """
        text = f"{title} {description}".lower()
        
        # Check for specific categories
        for category, data in DataIngestionService.CALORIE_ESTIMATES.items():
            if category == 'default':
                continue
            for keyword in data.get('keywords', []):
                if keyword in text:
                    base_cal = data['base']
                    # Adjust for size modifiers
                    if any(size in text for size in ['large', 'big', 'xl', 'extra large', 'jumbo', 'family']):
                        base_cal = int(base_cal * 1.5)
                    elif any(size in text for size in ['small', 'mini', 'kid', 'half']):
                        base_cal = int(base_cal * 0.6)
                    elif any(size in text for size in ['combo', 'meal', 'platter', 'feast']):
                        base_cal = int(base_cal * 1.4)
                    return base_cal
        
        return DataIngestionService.CALORIE_ESTIMATES['default']['base']
    
    @staticmethod
    def estimate_protein(title: str, description: str = '') -> float:
        """Estimate protein based on menu item.
        
        Args:
            title: Menu item title
            description: Item description
            
        Returns:
            Estimated protein in grams
        """
        text = f"{title} {description}".lower()
        
        for level, data in DataIngestionService.PROTEIN_ESTIMATES.items():
            if level == 'default':
                continue
            for keyword in data.get('keywords', []):
                if keyword in text:
                    return float(data['base'])
        
        return float(DataIngestionService.PROTEIN_ESTIMATES['default']['base'])
    
    @staticmethod
    def estimate_macros(title: str, description: str = '', calories: int = 500) -> Dict[str, float]:
        """Estimate macronutrients based on food type.
        
        Args:
            title: Menu item title
            description: Item description
            calories: Estimated calories
            
        Returns:
            Dict with protein, carbs, fat estimates
        """
        text = f"{title} {description}".lower()
        protein = DataIngestionService.estimate_protein(title, description)
        
        # Estimate based on food type
        if any(kw in text for kw in ['salad', 'vegetable', 'vegan']):
            # Low fat, moderate carbs
            fat = calories * 0.25 / 9  # 25% from fat
            carbs = (calories - (protein * 4) - (fat * 9)) / 4
        elif any(kw in text for kw in ['fried', 'fries', 'crispy', 'deep']):
            # High fat
            fat = calories * 0.45 / 9
            carbs = (calories - (protein * 4) - (fat * 9)) / 4
        elif any(kw in text for kw in ['grilled', 'baked', 'steamed', 'healthy']):
            # Lower fat
            fat = calories * 0.30 / 9
            carbs = (calories - (protein * 4) - (fat * 9)) / 4
        else:
            # Default balanced
            fat = calories * 0.35 / 9
            carbs = (calories - (protein * 4) - (fat * 9)) / 4
        
        return {
            'protein': round(protein, 1),
            'carbs': round(max(0, carbs), 1),
            'fat': round(max(0, fat), 1)
        }
    
    @staticmethod
    def detect_dietary_tags(title: str, description: str = '') -> List[str]:
        """Detect dietary tags from item text.
        
        Args:
            title: Menu item title
            description: Item description
            
        Returns:
            List of dietary tags
        """
        text = f"{title} {description}".lower()
        tags = []
        
        if any(kw in text for kw in ['vegan', 'plant-based', 'plant based']):
            tags.append('Vegan')
        if any(kw in text for kw in ['vegetarian', 'veggie', 'meatless']) and 'vegan' not in tags:
            tags.append('Vegetarian')
        if any(kw in text for kw in ['gluten-free', 'gluten free', 'gf']):
            tags.append('Gluten-Free')
        if any(kw in text for kw in ['keto', 'low carb', 'low-carb']):
            tags.append('Keto')
        if any(kw in text for kw in ['healthy', 'light', 'fit', 'lean']):
            tags.append('Healthy')
        if any(kw in text for kw in ['spicy', 'hot', 'jalapeno', 'buffalo', 'sriracha']):
            tags.append('Spicy')
        if any(kw in text for kw in ['organic']):
            tags.append('Organic')
        
        return tags
    
    @staticmethod
    def detect_spice_level(title: str, description: str = '') -> str:
        """Detect spice level from item text.
        
        Args:
            title: Menu item title
            description: Item description
            
        Returns:
            Spice level string
        """
        text = f"{title} {description}".lower()
        
        if any(kw in text for kw in ['extra spicy', 'very hot', 'ghost pepper', 'carolina reaper']):
            return 'Very Spicy'
        elif any(kw in text for kw in ['spicy', 'hot', 'jalapeno', 'buffalo', 'sriracha', 'habanero']):
            return 'Spicy'
        elif any(kw in text for kw in ['medium', 'mild spice', 'chipotle']):
            return 'Medium'
        else:
            return 'Mild'
    
    @classmethod
    def extract_menu_items(cls, excel_path: str) -> List[Dict[str, Any]]:
        """Extract all menu items from Uber Eats Excel export.
        
        Args:
            excel_path: Path to Excel file
            
        Returns:
            List of processed menu item dictionaries
        """
        df = pd.read_excel(excel_path)
        all_items = []
        seen_uuids = set()
        
        for idx, row in df.iterrows():
            restaurant_name = row.get('title', 'Unknown Restaurant')
            cuisine_type = row.get('cuisineList/0', 'Various')
            if pd.isna(cuisine_type):
                cuisine_type = 'Various'
            
            # Extract featured items (0-19)
            for i in range(20):
                prefix = f'featuredItems/{i}/'
                title = row.get(f'{prefix}title')
                item_uuid = row.get(f'{prefix}uuid', '')
                
                if pd.notna(title) and item_uuid not in seen_uuids:
                    seen_uuids.add(item_uuid)
                    description = row.get(f'{prefix}itemDescription', '') or ''
                    
                    # Parse price
                    price_raw = row.get(f'{prefix}price', 0)
                    price = float(price_raw) / 100 if pd.notna(price_raw) else 0
                    
                    # Estimate nutrition
                    calories = cls.estimate_calories(title, description)
                    macros = cls.estimate_macros(title, description, calories)
                    
                    item = {
                        'id': str(uuid.uuid4()),
                        'name': title,
                        'description': description if pd.notna(description) else f"Delicious {title} from {restaurant_name}",
                        'ingredients': [],
                        'cooking_method': 'Restaurant Prepared',
                        'cuisine_type': cuisine_type,
                        'cooking_time': '15-30 min',
                        'spice_level': cls.detect_spice_level(title, description),
                        'dietary_tags': cls.detect_dietary_tags(title, description),
                        'estimated_calories': calories,
                        'estimated_protein': macros['protein'],
                        'estimated_carbs': macros['carbs'],
                        'estimated_fat': macros['fat'],
                        'image_url': row.get(f'{prefix}imageUrl', ''),
                        'restaurant_name': restaurant_name,
                        'delivery_time': '20-35 min',
                        'rating': float(row.get(f'{prefix}rating', 0)) if pd.notna(row.get(f'{prefix}rating')) else None,
                        'price': round(price, 2),
                        'uber_uuid': item_uuid,
                        'tags': row.get(f'{prefix}tags/0', '')
                    }
                    all_items.append(item)
            
            # Extract menu items (0-50)
            for i in range(50):
                prefix = f'menu/0/catalogItems/{i}/'
                title = row.get(f'{prefix}title')
                item_uuid = row.get(f'{prefix}uuid', '')
                
                if pd.notna(title) and item_uuid not in seen_uuids:
                    seen_uuids.add(item_uuid)
                    description = row.get(f'{prefix}itemDescription', '') or ''
                    
                    # Parse price
                    price_raw = row.get(f'{prefix}price', 0)
                    price = float(price_raw) / 100 if pd.notna(price_raw) else 0
                    
                    # Estimate nutrition
                    calories = cls.estimate_calories(title, description)
                    macros = cls.estimate_macros(title, description, calories)
                    
                    item = {
                        'id': str(uuid.uuid4()),
                        'name': title,
                        'description': description if pd.notna(description) else f"Delicious {title} from {restaurant_name}",
                        'ingredients': [],
                        'cooking_method': 'Restaurant Prepared',
                        'cuisine_type': cuisine_type,
                        'cooking_time': '15-30 min',
                        'spice_level': cls.detect_spice_level(title, description),
                        'dietary_tags': cls.detect_dietary_tags(title, description),
                        'estimated_calories': calories,
                        'estimated_protein': macros['protein'],
                        'estimated_carbs': macros['carbs'],
                        'estimated_fat': macros['fat'],
                        'image_url': row.get(f'{prefix}imageUrl', ''),
                        'restaurant_name': restaurant_name,
                        'delivery_time': '20-35 min',
                        'rating': float(row.get(f'{prefix}rating', 0)) if pd.notna(row.get(f'{prefix}rating')) else None,
                        'price': round(price, 2),
                        'uber_uuid': item_uuid,
                        'tags': row.get(f'{prefix}labelPrimary', '')
                    }
                    all_items.append(item)
        
        return all_items
