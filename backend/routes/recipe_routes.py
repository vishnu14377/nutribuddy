"""Recipe API routes."""

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from typing import List, Optional
import os
import tempfile
import logging

from models.recipe import Recipe, SearchQuery, SearchResult
from services.vector_service import VectorService
from services.explanation_service import ExplanationService
from services.database_service import DatabaseService
from services.data_ingestion_service import DataIngestionService
from services.ai_search_service import EnhancedSearchPipeline

logger = logging.getLogger(__name__)


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
    
    @router.get("/stats")
    async def get_stats():
        """Get database and vector index statistics."""
        try:
            total_count = db_service.get_count()
            return {
                "database": {
                    "total_items": total_count
                },
                "status": "ready"
            }
        except Exception as e:
            return {"error": str(e)}
    
    @router.post("/upload/excel")
    async def upload_excel(file: UploadFile = File(...)):
        """Upload and process Uber Eats Excel data.
        
        This endpoint accepts an Excel file from Uber Eats scraper,
        extracts menu items, estimates nutrition, and indexes them.
        """
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="File must be Excel format (.xlsx or .xls)")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Extract menu items
            logger.info("Extracting menu items from Excel...")
            items = DataIngestionService.extract_menu_items(tmp_path)
            logger.info(f"Extracted {len(items)} menu items")
            
            # Store in SQLite
            stored_count = 0
            for item in items:
                db_service.upsert_recipe(item)
                stored_count += 1
            
            logger.info(f"Stored {stored_count} items in SQLite")
            
            # Convert to Recipe objects for vectorization
            recipes = [Recipe(**item) for item in items]
            
            # Store in Pinecone (batch)
            logger.info("Vectorizing and indexing items...")
            vectorized = vector_service.store_recipes_batch(recipes, batch_size=50)
            logger.info(f"Vectorized {vectorized} items")
            
            return {
                "message": f"Successfully processed {len(items)} menu items",
                "details": {
                    "extracted": len(items),
                    "stored_in_db": stored_count,
                    "vectorized": vectorized,
                    "unique_restaurants": len(set(item['restaurant_name'] for item in items))
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing Excel: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            # Cleanup temp file
            os.unlink(tmp_path)
    
    @router.post("/upload/url")
    async def upload_from_url(url: str):
        """Process Uber Eats data from URL.
        
        Args:
            url: URL to Excel file
        """
        import requests
        
        try:
            # Download file
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            
            # Save temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
            
            # Extract and process
            items = DataIngestionService.extract_menu_items(tmp_path)
            
            # Store in SQLite
            for item in items:
                db_service.upsert_recipe(item)
            
            # Vectorize
            recipes = [Recipe(**item) for item in items]
            vectorized = vector_service.store_recipes_batch(recipes, batch_size=50)
            
            os.unlink(tmp_path)
            
            return {
                "message": f"Successfully processed {len(items)} menu items",
                "vectorized": vectorized
            }
            
        except Exception as e:
            logger.error(f"Error processing URL: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.post("/recipes/upload")
    async def upload_recipes():
        """Load sample recipes (for demo purposes)."""
        from utils.recipe_data import RECIPE_DATA
        from services.nutrition_service import NutritionService
        
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
        
        return {"message": f"Successfully loaded {uploaded_count} sample dishes"}
    
    @router.post("/search", response_model=List[SearchResult])
    async def search_recipes(query: SearchQuery):
        """Search menu items using natural language with AI-powered matching.
        
        The AI understands:
        - Nutrition queries: "high protein", "under 500 calories", "low carb"
        - Cuisine types: "Indian food", "pizza", "sushi"
        - Dietary needs: "vegetarian", "vegan", "gluten-free"
        - Preferences: "spicy", "mild", "comfort food"
        """
        # Search in vector database
        search_results = vector_service.search(
            query.query, 
            top_k=15,
            filters=query.filters
        )
        
        results: List[SearchResult] = []
        
        for match in search_results:
            # Get full recipe from SQLite
            recipe_doc = db_service.get_recipe_by_id(match['id'])
            
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                
                # Generate AI explanation
                explanation = ExplanationService.generate_explanation(
                    query.query,
                    recipe
                )
                
                results.append(SearchResult(
                    recipe=recipe,
                    match_score=match['score'],
                    match_explanation=explanation
                ))
        
        # Sort by match score
        results.sort(key=lambda x: x.match_score, reverse=True)
        
        return results[:10]
    
    @router.get("/recipes", response_model=List[Recipe])
    async def get_all_recipes(limit: int = 100, cuisine: Optional[str] = None):
        """Get all menu items from database."""
        recipes = db_service.get_all_recipes(limit=limit)
        
        if cuisine:
            recipes = [r for r in recipes if cuisine.lower() in (r.get('cuisine_type', '') or '').lower()]
        
        return [Recipe(**r) for r in recipes]
    
    @router.get("/recipes/{recipe_id}", response_model=Recipe)
    async def get_recipe(recipe_id: str):
        """Get a specific recipe by ID."""
        recipe = db_service.get_recipe_by_id(recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return Recipe(**recipe)
    
    @router.delete("/recipes/clear")
    async def clear_all():
        """Clear all data (use with caution)."""
        try:
            vector_service.clear_index()
            # Clear SQLite
            with db_service.get_connection() as conn:
                conn.execute("DELETE FROM recipes")
            return {"message": "All data cleared successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    return router
