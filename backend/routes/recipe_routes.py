"""Recipe API routes."""

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List

from models.recipe import Recipe, SearchQuery, SearchResult
from services.vector_service import VectorService
from services.nutrition_service import NutritionService
from services.explanation_service import ExplanationService
from utils.recipe_data import RECIPE_DATA


def create_recipe_router(
    db: AsyncIOMotorDatabase,
    vector_service: VectorService
) -> APIRouter:
    """Create recipe routes.
    
    Args:
        db: MongoDB database instance
        vector_service: Vector search service
        
    Returns:
        Configured APIRouter
    """
    router = APIRouter(prefix="/api", tags=["recipes"])
    
    @router.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "NIMA - Nutritional Intelligence Menu Assistant"}
    
    @router.post("/recipes/upload")
    async def upload_recipes():
        """Load recipes from cookbook data into MongoDB and Pinecone."""
        uploaded_count = 0
        
        for recipe_data in RECIPE_DATA:
            # Calculate nutrition
            nutrition = NutritionService.calculate_nutrition(
                recipe_data['ingredients']
            )
            recipe_data.update({
                'estimated_calories': nutrition['calories'],
                'estimated_protein': nutrition['protein'],
                'estimated_carbs': nutrition['carbs'],
                'estimated_fat': nutrition['fat']
            })
            
            # Create recipe object
            recipe = Recipe(**recipe_data)
            
            # Store in MongoDB
            recipe_dict = recipe.model_dump()
            await db.recipes.update_one(
                {"name": recipe.name},
                {"$set": recipe_dict},
                upsert=True
            )
            
            # Store in vector database
            vector_service.store_recipe(recipe)
            uploaded_count += 1
        
        return {"message": f"Successfully uploaded {uploaded_count} recipes"}
    
    @router.post("/search", response_model=List[SearchResult])
    async def search_recipes(query: SearchQuery):
        """Search recipes using natural language with AI-powered matching."""
        # Search in vector database
        search_results = vector_service.search(query.query, top_k=10)
        
        results: List[SearchResult] = []
        
        for match in search_results:
            # Get full recipe from MongoDB
            recipe_doc = await db.recipes.find_one({"id": match['id']})
            
            if recipe_doc:
                recipe_doc.pop('_id', None)
                recipe = Recipe(**recipe_doc)
                
                # Generate explanation
                explanation = ExplanationService.generate_explanation(
                    query.query,
                    recipe
                )
                
                results.append(SearchResult(
                    recipe=recipe,
                    match_score=match['score'],
                    match_explanation=explanation
                ))
        
        return results
    
    @router.get("/recipes", response_model=List[Recipe])
    async def get_all_recipes():
        """Get all recipes from database."""
        recipes = await db.recipes.find({}, {"_id": 0}).to_list(100)
        return [Recipe(**r) for r in recipes]
    
    return router
