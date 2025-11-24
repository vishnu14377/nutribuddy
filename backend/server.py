from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import google.generativeai as genai
from pinecone import Pinecone, ServerlessSpec
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Configure Google Gemini
genai.configure(api_key=os.environ['GOOGLE_API_KEY'])

# Initialize Pinecone
pc = Pinecone(api_key=os.environ['PINECONE_API_KEY'])
index_name = "nima-recipes"

# Check if index exists, create if not
if index_name not in pc.list_indexes().names():
    pc.create_index(
        name=index_name,
        dimension=768,
        metric='cosine',
        spec=ServerlessSpec(
            cloud='aws',
            region='us-east-1'
        )
    )

index = pc.Index(index_name)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class Recipe(BaseModel):
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

class SearchQuery(BaseModel):
    query: str
    filters: Optional[dict] = {}

class SearchResult(BaseModel):
    recipe: Recipe
    match_score: float
    match_explanation: str

# Nutritional calculator based on ingredients
def calculate_nutrition(ingredients: List[str], servings: int = 2) -> dict:
    """Calculate estimated nutrition from ingredients"""
    
    nutrition_db = {
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
    
    total_cal, total_protein, total_carbs, total_fat = 0, 0, 0, 0
    
    for ingredient in ingredients:
        ingredient_lower = ingredient.lower()
        for key, values in nutrition_db.items():
            if key in ingredient_lower:
                # Extract quantity if present
                quantity_match = re.search(r'(\d+)\s*g', ingredient_lower)
                multiplier = 1
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

# Generate embeddings using Google Gemini
def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Gemini embedding model"""
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document"
    )
    return result['embedding']

@api_router.get("/")
async def root():
    return {"message": "NIMA - Nutritional Intelligence Menu Assistant"}

@api_router.post("/recipes/upload")
async def upload_recipes():
    """Load recipes from the CleverChef cookbook data into MongoDB and Pinecone"""
    
    # Recipe data extracted from PDF
    recipes_data = [
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
    
    uploaded_count = 0
    
    for recipe_data in recipes_data:
        # Calculate nutrition
        nutrition = calculate_nutrition(recipe_data['ingredients'])
        recipe_data['estimated_calories'] = nutrition['calories']
        recipe_data['estimated_protein'] = nutrition['protein']
        recipe_data['estimated_carbs'] = nutrition['carbs']
        recipe_data['estimated_fat'] = nutrition['fat']
        
        # Create recipe object
        recipe = Recipe(**recipe_data)
        
        # Store in MongoDB
        recipe_dict = recipe.model_dump()
        await db.recipes.update_one(
            {"name": recipe.name},
            {"$set": recipe_dict},
            upsert=True
        )
        
        # Create searchable text for embedding
        searchable_text = f"""
        Recipe: {recipe.name}
        Cuisine: {recipe.cuisine_type}
        Cooking Method: {recipe.cooking_method}
        Ingredients: {', '.join(recipe.ingredients)}
        Spice Level: {recipe.spice_level}
        Dietary Tags: {', '.join(recipe.dietary_tags)}
        Nutrition: {recipe.estimated_calories} calories, {recipe.estimated_protein}g protein, {recipe.estimated_carbs}g carbs, {recipe.estimated_fat}g fat
        Description: {recipe.description}
        """
        
        # Generate embedding
        embedding = generate_embedding(searchable_text)
        
        # Store in Pinecone
        index.upsert(
            vectors=[{
                'id': recipe.id,
                'values': embedding,
                'metadata': {
                    'name': recipe.name,
                    'cuisine_type': recipe.cuisine_type,
                    'spice_level': recipe.spice_level or 'Mild',
                    'dietary_tags': ','.join(recipe.dietary_tags),
                    'calories': recipe.estimated_calories
                }
            }]
        )
        
        uploaded_count += 1
    
    return {"message": f"Successfully uploaded {uploaded_count} recipes"}

@api_router.post("/search", response_model=List[SearchResult])
async def search_recipes(query: SearchQuery):
    """Search recipes using natural language with AI-powered matching"""
    
    # Generate query embedding
    query_embedding = generate_embedding(query.query)
    
    # Search in Pinecone
    search_results = index.query(
        vector=query_embedding,
        top_k=10,
        include_metadata=True
    )
    
    results = []
    
    for match in search_results['matches']:
        # Get full recipe from MongoDB
        recipe_doc = await db.recipes.find_one({"id": match['id']})
        if recipe_doc:
            recipe_doc.pop('_id', None)
            recipe = Recipe(**recipe_doc)
            
            # Generate match explanation using Gemini
            model = genai.GenerativeModel('gemini-2.0-flash')
            explanation_prompt = f"""
            User is searching for: "{query.query}"
            
            Recipe found: {recipe.name}
            Cuisine: {recipe.cuisine_type}
            Ingredients: {', '.join(recipe.ingredients[:5])}...
            Nutrition: {recipe.estimated_calories} cal, {recipe.estimated_protein}g protein
            Spice: {recipe.spice_level}
            Tags: {', '.join(recipe.dietary_tags)}
            
            In 1-2 sentences, explain why this recipe matches the user's search. Be specific about nutrition, ingredients, or dietary needs.
            """
            
            response = model.generate_content(explanation_prompt)
            explanation = response.text.strip()
            
            results.append(SearchResult(
                recipe=recipe,
                match_score=match['score'],
                match_explanation=explanation
            ))
    
    return results

@api_router.get("/recipes", response_model=List[Recipe])
async def get_all_recipes():
    """Get all recipes"""
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(100)
    return [Recipe(**r) for r in recipes]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()