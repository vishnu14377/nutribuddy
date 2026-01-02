"""Nutribuddy API routes - AI-powered nutritional search."""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Optional
import tempfile
import os
import logging

from models.recipe import Recipe, SearchQuery, SearchResult
from services.database_service import DatabaseService
from services.vector_service import VectorService
from services.ai_search_service import EnhancedAISearchService, ExplanationService
from services.openai_service import OpenAIService
from services.data_ingestion_service import DataIngestionService

logger = logging.getLogger(__name__)


def create_recipe_router(
    db_service: DatabaseService, 
    vector_service: VectorService,
    openai_api_key: str = None
) -> APIRouter:
    """Create recipe router."""
    router = APIRouter(prefix="/api", tags=["nutribuddy"])
    
    enhanced_search = None
    openai_service = None
    
    if openai_api_key:
        try:
            enhanced_search = EnhancedAISearchService(
                vector_service=vector_service,
                db_service=db_service,
                openai_api_key=openai_api_key
            )
            openai_service = OpenAIService(api_key=openai_api_key)
            logger.info("Nutribuddy AI Search enabled")
        except Exception as e:
            logger.error(f"Failed to initialize AI search: {e}")
    
    @router.get("/stats")
    async def get_stats():
        """Get database statistics."""
        return {
            "database": {"count": db_service.get_count()},
            "vector_store": vector_service.get_index_stats(),
            "engine": "OpenAI embeddings + nutritional filtering"
        }
    
    @router.post("/ingest/url")
    async def ingest_from_url(url: str, limit: int = 200):
        """Import menu data from Excel URL."""
        import requests
        import time
        
        if not openai_service:
            raise HTTPException(status_code=500, detail="OpenAI not configured")
        
        try:
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
            
            raw_items = DataIngestionService.extract_menu_items_from_excel(tmp_path, limit=limit)
            os.unlink(tmp_path)
            
            if not raw_items:
                raise HTTPException(status_code=400, detail="No items found")
            
            vector_service.clear_index()
            with db_service.get_connection() as conn:
                conn.execute("DELETE FROM recipes")
            
            items = []
            for i, raw_item in enumerate(raw_items):
                try:
                    nutrition = openai_service.estimate_nutrition(
                        raw_item['name'], 
                        raw_item.get('description', '')
                    )
                    item = {
                        **raw_item,
                        'estimated_calories': nutrition['calories'],
                        'estimated_protein': nutrition['protein'],
                        'estimated_carbs': nutrition['carbs'],
                        'estimated_fat': nutrition['fat'],
                        'dietary_tags': nutrition.get('dietary_tags', [])
                    }
                    items.append(item)
                    
                    if (i + 1) % 5 == 0:
                        import time
                        time.sleep(1)
                except Exception as e:
                    logger.error(f"Error: {e}")
            
            for item in items:
                db_service.upsert_recipe(item)
            
            recipes = [Recipe(**item) for item in items]
            vector_service.store_recipes_batch(recipes, batch_size=20)
            
            return {"message": f"Imported {len(items)} items", "count": len(items)}
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.post("/search", response_model=List[SearchResult])
    async def search(query: SearchQuery):
        """AI-powered nutritional search."""
        if enhanced_search:
            results = enhanced_search.search(query.query, top_k=10)
            return [SearchResult(
                recipe=r['recipe'],
                match_score=r['match_score'],
                match_explanation=r['match_explanation']
            ) for r in results]
        
        search_results = vector_service.search(query.query, top_k=15)
        results = []
        
        for match in search_results:
            recipe_doc = db_service.get_recipe_by_id(match['id'])
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                results.append(SearchResult(
                    recipe=recipe,
                    match_score=match['score'],
                    match_explanation=ExplanationService.generate_explanation(query.query, recipe)
                ))
        
        return sorted(results, key=lambda x: x.match_score, reverse=True)[:10]
    
    @router.get("/recipes", response_model=List[Recipe])
    async def get_recipes(limit: int = 100):
        """Get all menu items."""
        recipes = db_service.get_all_recipes(limit=limit)
        return [Recipe(**r) for r in recipes]
    
    @router.get("/recipes/{recipe_id}", response_model=Recipe)
    async def get_recipe(recipe_id: str):
        """Get recipe by ID."""
        recipe = db_service.get_recipe_by_id(recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Not found")
        return Recipe(**recipe)
    
    @router.delete("/recipes/clear")
    async def clear_all():
        """Clear all data."""
        vector_service.clear_index()
        with db_service.get_connection() as conn:
            conn.execute("DELETE FROM recipes")
        return {"message": "Cleared"}
    
    return router
