"""Recipe data extracted from CleverChef cookbook."""

from typing import List, Dict, Any


RECIPE_DATA: List[Dict[str, Any]] = [
    {
        "name": "Beef & Guinness Stew",
        "ingredients": ["olive oil", "500g diced beef", "onion", "garlic", "carrot", "celery", "pickling onions", "thyme", "bay leaf", "Worcestershire sauce", "Guinness"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "British",
        "cooking_time": "26 minutes",
        "spice_level": "Mild",
        "dietary_tags": [],
        "description": "Rich and hearty beef stew with Guinness beer"
    },
    {
        "name": "Classic Bolognese",
        "ingredients": ["olive oil", "1kg minced beef", "onion", "garlic", "carrot", "celery", "balsamic vinegar", "tomato purée", "chopped tomatoes", "red wine", "beef stock"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Italian",
        "cooking_time": "30 minutes",
        "spice_level": "Mild",
        "dietary_tags": [],
        "description": "Traditional Italian meat sauce perfect for pasta"
    },
    {
        "name": "Moroccan Lamb Tagine",
        "ingredients": ["olive oil", "onions", "garlic", "500g diced lamb", "cayenne pepper", "paprika", "ground ginger", "turmeric", "cinnamon", "chopped tomatoes", "dried apricots", "raisins", "stock"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Moroccan",
        "cooking_time": "25 minutes",
        "spice_level": "Medium Spicy",
        "dietary_tags": [],
        "description": "Aromatic and spicy Moroccan lamb with dried fruits"
    },
    {
        "name": "Chicken Tikka Masala",
        "ingredients": ["olive oil", "onion", "garlic", "fresh ginger", "cumin", "coriander seeds", "chilli powder", "turmeric", "chopped tomatoes", "4 chicken breasts", "chicken stock", "spinach"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Indian",
        "cooking_time": "20 minutes",
        "spice_level": "Medium Spicy",
        "dietary_tags": [],
        "description": "Popular Indian curry with tender chicken in creamy tomato sauce"
    },
    {
        "name": "Thai Green Curry",
        "ingredients": ["olive oil", "1kg chicken breast", "green curry paste", "garlic", "ginger", "fish sauce", "soy sauce", "brown sugar", "red pepper", "carrots", "green beans", "chicken stock", "lemongrass", "coconut milk", "coriander"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Thai",
        "cooking_time": "25 minutes",
        "spice_level": "Spicy",
        "dietary_tags": [],
        "description": "Authentic Thai curry with aromatic herbs and coconut milk"
    },
    {
        "name": "Lentil, Barley and Butternut Risotto",
        "ingredients": ["olive oil", "red onion", "garlic", "butternut squash", "150g pearl barley", "150g green lentils", "vegetable stock", "white wine"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Italian",
        "cooking_time": "25 minutes",
        "spice_level": "Mild",
        "dietary_tags": ["Vegetarian", "High Fiber"],
        "description": "Healthy vegetarian risotto rich in fiber and nutrients"
    },
    {
        "name": "Dal Makhani",
        "ingredients": ["olive oil", "onion", "garlic", "ginger", "green chillies", "ground cumin", "turmeric", "garam masala", "300g black lentils", "kidney beans", "chopped tomatoes", "water", "butter"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Indian",
        "cooking_time": "25 minutes",
        "spice_level": "Medium Spicy",
        "dietary_tags": ["Vegetarian", "High Protein"],
        "description": "Rich and creamy Indian lentil curry"
    },
    {
        "name": "Chinese Style Sea Bass",
        "ingredients": ["2 sea bass fillets", "red chilli", "ginger", "green cabbage", "sunflower oil", "sesame oil", "garlic", "soy sauce"],
        "cooking_method": "Steam",
        "cuisine_type": "Chinese",
        "cooking_time": "4 minutes",
        "spice_level": "Mild Spicy",
        "dietary_tags": ["Low Carb", "High Protein"],
        "description": "Light and healthy steamed sea bass with Asian flavors"
    },
    {
        "name": "Vegan Three-Bean Chilli",
        "ingredients": ["olive oil", "garlic", "red onion", "red pepper", "ground cumin", "paprika", "chilli powder", "kidney beans", "butter beans", "adzuki beans", "chopped tomatoes", "red wine"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Mexican",
        "cooking_time": "30 minutes",
        "spice_level": "Spicy",
        "dietary_tags": ["Vegan", "High Fiber", "High Protein"],
        "description": "Hearty vegan chilli packed with plant protein"
    },
    {
        "name": "Chicken & Chorizo Paella",
        "ingredients": ["olive oil", "red pepper", "onion", "garlic", "chorizo sausages", "2 chicken breasts", "250g paella rice", "chopped tomatoes", "paella seasoning", "chicken stock", "frozen peas"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Spanish",
        "cooking_time": "20 minutes",
        "spice_level": "Mild Spicy",
        "dietary_tags": [],
        "description": "Traditional Spanish rice dish with chicken and chorizo"
    },
    {
        "name": "Cauli & Courgette Curry",
        "ingredients": ["olive oil", "onions", "garlic", "ginger", "turmeric", "chilli powder", "curry leaves", "cumin", "coriander", "cauliflower", "courgette", "coconut milk"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Indian",
        "cooking_time": "15 minutes",
        "spice_level": "Medium Spicy",
        "dietary_tags": ["Vegetarian", "Low Carb"],
        "description": "Light vegetable curry in coconut sauce"
    },
    {
        "name": "Sous Vide Salmon Fillet",
        "ingredients": ["4 salmon fillets", "olive oil", "lemon", "fennel bulbs", "black peppercorns"],
        "cooking_method": "Sous Vide",
        "cuisine_type": "International",
        "cooking_time": "1 hour",
        "spice_level": "Mild",
        "dietary_tags": ["Low Carb", "High Protein", "Healthy Fats"],
        "description": "Perfectly cooked salmon with delicate fennel and lemon"
    },
    {
        "name": "Maple Glazed Sticky BBQ Ribs",
        "ingredients": ["olive oil", "onions", "1.2kg pork ribs", "maple syrup", "garlic", "soy sauce", "cider vinegar", "tomato puree", "mustard powder", "sweet chilli sauce", "stock"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "American BBQ",
        "cooking_time": "36 minutes",
        "spice_level": "Mild Spicy",
        "dietary_tags": [],
        "description": "Sweet and sticky BBQ ribs with maple glaze"
    },
    {
        "name": "Chicken Burrito Bowls",
        "ingredients": ["500g chicken breast", "taco seasoning", "chicken stock", "black beans", "sweetcorn", "salsa", "green chilli", "250g rice", "cheese"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Mexican",
        "cooking_time": "12 minutes",
        "spice_level": "Medium Spicy",
        "dietary_tags": [],
        "description": "Complete meal bowl with chicken, rice, and beans"
    },
    {
        "name": "Vegetable Soup",
        "ingredients": ["olive oil", "onion", "garlic", "green pepper", "celery", "potato", "sugar snap peas", "500g carrots", "vegetable stock", "herbs de provence"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "International",
        "cooking_time": "15 minutes",
        "spice_level": "Mild",
        "dietary_tags": ["Vegetarian", "Low Calorie", "High Fiber"],
        "description": "Light and healthy vegetable soup"
    },
    {
        "name": "Chilli Con Carne",
        "ingredients": ["olive oil", "500g minced beef", "garlic", "cumin seeds", "dried oregano", "chilli powder", "smoked paprika", "tomato purée", "red pepper", "chopped tomatoes", "kidney beans", "beef stock"],
        "cooking_method": "Pressure Cook",
        "cuisine_type": "Mexican",
        "cooking_time": "27 minutes",
        "spice_level": "Spicy",
        "dietary_tags": ["High Protein"],
        "description": "Classic spicy beef and bean stew"
    }
]
