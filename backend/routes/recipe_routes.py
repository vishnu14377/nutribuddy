"""Recipe API routes."""

from fastapi import APIRouter, HTTPException
from typing import List

from models.recipe import Recipe, SearchQuery, SearchResult
from services.vector_service import VectorService
from services.nutrition_service import NutritionService
from services.explanation_service import ExplanationService
from services.database_service import DatabaseService
from utils.recipe_data import RECIPE_DATA


def create_recipe_router(
    db_service: DatabaseService,
    vector_service: VectorService
) -> APIRouter:
    """Create recipe routes.
    
    Args:
        db_service: SQLite database service
        vector_service: Vector search service
        
    Returns:
        Configured APIRouter
    """
    router = APIRouter(prefix="/api", tags=["recipes"])
    
    @router.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Uber Eats AI Search - Find Your Perfect Meal"}
    
    @router.post("/recipes/upload")
    async def upload_recipes():
        """Load recipes from cookbook data into SQLite and Pinecone."""
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
            
            # Store in SQLite
            recipe_dict = recipe.model_dump()
            db_service.upsert_recipe(recipe_dict)
            
            # Store in vector database
            vector_service.store_recipe(recipe)
            uploaded_count += 1
        
        return {"message": f"Successfully loaded {uploaded_count} dishes"}
    
    @router.post("/search", response_model=List[SearchResult])
    async def search_recipes(query: SearchQuery):
        """Search recipes using natural language with AI-powered matching."""
        # Search in vector database
        search_results = vector_service.search(query.query, top_k=10)
        
        results: List[SearchResult] = []
        
        for match in search_results:
            # Get full recipe from SQLite
            recipe_doc = db_service.get_recipe_by_id(match['id'])
            
            if recipe_doc:
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
        recipes = db_service.get_all_recipes()
        return [Recipe(**r) for r in recipes]
    
    return router
