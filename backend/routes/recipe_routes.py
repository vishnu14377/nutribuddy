"""Recipe API routes with OpenAI-powered search and data ingestion."""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Optional
import tempfile
import os
import logging
import uuid
import time

from models.recipe import Recipe, SearchQuery, SearchResult
from services.database_service import DatabaseService
from services.vector_service import VectorService
from services.ai_search_service import EnhancedAISearchService, ExplanationService
from services.openai_service import OpenAIService

logger = logging.getLogger(__name__)


def create_recipe_router(
    db_service: DatabaseService, 
    vector_service: VectorService,
    openai_api_key: str = None
) -> APIRouter:
    """Create recipe router with injected dependencies.
    
    Args:
        db_service: Database service instance
        vector_service: Vector search service instance
        openai_api_key: OpenAI API key for enhanced search
        
    Returns:
        Configured APIRouter
    """
    router = APIRouter(prefix="/api", tags=["recipes"])
    
    # Initialize enhanced AI search with OpenAI if key provided
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
            logger.info("Enhanced AI Search enabled with OpenAI")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI search: {e}")
    
    @router.get("/stats")
    async def get_stats():
        """Get database and vector store statistics."""
        db_count = db_service.get_count()
        vector_stats = vector_service.get_index_stats()
        
        return {
            "database": {
                "type": "SQLite",
                "recipe_count": db_count
            },
            "vector_store": vector_stats,
            "search_engine": "OpenAI text-embedding-3-large + GPT-4o re-ranking"
        }
    
    @router.post("/ingest/excel")
    async def ingest_from_excel(file: UploadFile = File(...)):
        """Process Uber Eats data from uploaded Excel file with AI nutrition estimation.
        
        This endpoint:
        1. Clears existing data
        2. Parses the Excel file
        3. Uses GPT-4o to estimate nutritional values
        4. Generates OpenAI embeddings
        5. Stores in both SQLite and Pinecone
        """
        if not openai_service:
            raise HTTPException(status_code=500, detail="OpenAI service not configured")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            import pandas as pd
            
            # Read Excel file
            df = pd.read_excel(tmp_path)
            logger.info(f"Read {len(df)} rows from Excel")
            logger.info(f"Columns: {df.columns.tolist()}")
            
            # Clear existing data
            logger.info("Clearing existing data...")
            vector_service.clear_index()
            with db_service.get_connection() as conn:
                conn.execute("DELETE FROM recipes")
            
            # Process items
            items = []
            processed = 0
            errors = 0
            
            for idx, row in df.iterrows():
                try:
                    # Extract item data based on common column patterns
                    name = str(row.get('title', row.get('name', row.get('itemTitle', ''))))
                    if not name or name == 'nan':
                        continue
                    
                    description = str(row.get('itemDescription', row.get('description', '')))
                    if description == 'nan':
                        description = ''
                    
                    price_raw = row.get('price', row.get('itemPrice', 0))
                    try:
                        # Handle price strings like "$15.99"
                        if isinstance(price_raw, str):
                            price = float(price_raw.replace('$', '').replace(',', ''))
                        else:
                            price = float(price_raw) if price_raw else 0
                    except:
                        price = 0
                    
                    restaurant = str(row.get('restaurantName', row.get('restaurant', '')))
                    if restaurant == 'nan':
                        restaurant = 'Unknown Restaurant'
                    
                    image_url = str(row.get('imageUrl', row.get('image_url', '')))
                    if image_url == 'nan':
                        image_url = ''
                    
                    cuisine = str(row.get('cuisineList', row.get('cuisine', row.get('categories', ''))))
                    if cuisine == 'nan':
                        cuisine = 'Various'
                    
                    rating = row.get('rating', row.get('ratingValue', 0))
                    try:
                        rating = float(rating) if rating else 0
                    except:
                        rating = 0
                    
                    uber_uuid = str(row.get('uuid', ''))
                    if uber_uuid == 'nan':
                        uber_uuid = ''
                    
                    # Estimate nutrition using GPT-4o
                    logger.info(f"Estimating nutrition for: {name[:50]}...")
                    nutrition = openai_service.estimate_nutrition(name, description)
                    
                    item = {
                        'id': str(uuid.uuid4()),
                        'name': name[:200],
                        'description': description[:500],
                        'restaurant_name': restaurant[:100],
                        'cuisine_type': cuisine[:50] if cuisine else 'Various',
                        'image_url': image_url,
                        'price': price,
                        'rating': rating,
                        'uber_uuid': uber_uuid,
                        'estimated_calories': nutrition['calories'],
                        'estimated_protein': nutrition['protein'],
                        'estimated_carbs': nutrition['carbs'],
                        'estimated_fat': nutrition['fat'],
                        'dietary_tags': nutrition.get('dietary_tags', []),
                        'spice_level': 'Medium'
                    }
                    
                    items.append(item)
                    processed += 1
                    
                    # Process in small batches to avoid rate limits
                    if processed % 10 == 0:
                        logger.info(f"Processed {processed} items...")
                        time.sleep(1)  # Rate limit protection
                    
                except Exception as e:
                    logger.error(f"Error processing row {idx}: {e}")
                    errors += 1
                    continue
            
            # Store in database
            logger.info(f"Storing {len(items)} items in SQLite...")
            for item in items:
                db_service.upsert_recipe(item)
            
            # Vectorize
            logger.info("Generating embeddings and storing in Pinecone...")
            recipes = [Recipe(**item) for item in items]
            vectorized = vector_service.store_recipes_batch(recipes, batch_size=20)
            
            return {
                "message": f"Successfully processed {len(items)} menu items",
                "stats": {
                    "total_rows": len(df),
                    "processed": processed,
                    "stored_in_db": len(items),
                    "vectorized": vectorized,
                    "errors": errors
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing Excel: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            os.unlink(tmp_path)
    
    @router.post("/ingest/url")
    async def ingest_from_url(url: str):
        """Process Uber Eats data from URL with AI nutrition estimation.
        
        Args:
            url: URL to Excel file
        """
        import requests
        import pandas as pd
        
        if not openai_service:
            raise HTTPException(status_code=500, detail="OpenAI service not configured")
        
        try:
            logger.info(f"Downloading file from: {url}")
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
            
            # Read Excel file
            df = pd.read_excel(tmp_path)
            logger.info(f"Read {len(df)} rows from Excel")
            logger.info(f"Columns: {df.columns.tolist()}")
            
            # Clear existing data
            logger.info("Clearing existing Pinecone data...")
            vector_service.clear_index()
            
            logger.info("Clearing existing SQLite data...")
            with db_service.get_connection() as conn:
                conn.execute("DELETE FROM recipes")
            
            # Process items
            items = []
            processed = 0
            errors = 0
            
            for idx, row in df.iterrows():
                try:
                    # Extract item data
                    name = str(row.get('title', row.get('name', row.get('itemTitle', ''))))
                    if not name or name == 'nan':
                        continue
                    
                    description = str(row.get('itemDescription', row.get('description', '')))
                    if description == 'nan':
                        description = ''
                    
                    price_raw = row.get('price', row.get('itemPrice', 0))
                    try:
                        if isinstance(price_raw, str):
                            price = float(price_raw.replace('$', '').replace(',', ''))
                        else:
                            price = float(price_raw) if price_raw else 0
                    except:
                        price = 0
                    
                    restaurant = str(row.get('restaurantName', row.get('restaurant', '')))
                    if restaurant == 'nan':
                        restaurant = 'Unknown Restaurant'
                    
                    image_url = str(row.get('imageUrl', row.get('image_url', '')))
                    if image_url == 'nan':
                        image_url = ''
                    
                    cuisine = str(row.get('cuisineList', row.get('cuisine', row.get('categories', ''))))
                    if cuisine == 'nan':
                        cuisine = 'Various'
                    
                    rating = row.get('rating', row.get('ratingValue', 0))
                    try:
                        rating = float(rating) if rating else 0
                    except:
                        rating = 0
                    
                    uber_uuid = str(row.get('uuid', ''))
                    if uber_uuid == 'nan':
                        uber_uuid = ''
                    
                    # Estimate nutrition using GPT-4o
                    logger.info(f"[{processed+1}] Estimating nutrition for: {name[:50]}...")
                    nutrition = openai_service.estimate_nutrition(name, description)
                    
                    item = {
                        'id': str(uuid.uuid4()),
                        'name': name[:200],
                        'description': description[:500],
                        'restaurant_name': restaurant[:100],
                        'cuisine_type': cuisine[:50] if cuisine else 'Various',
                        'image_url': image_url,
                        'price': price,
                        'rating': rating,
                        'uber_uuid': uber_uuid,
                        'estimated_calories': nutrition['calories'],
                        'estimated_protein': nutrition['protein'],
                        'estimated_carbs': nutrition['carbs'],
                        'estimated_fat': nutrition['fat'],
                        'dietary_tags': nutrition.get('dietary_tags', []),
                        'spice_level': 'Medium'
                    }
                    
                    items.append(item)
                    processed += 1
                    
                    # Rate limit protection
                    if processed % 5 == 0:
                        logger.info(f"Processed {processed} items, sleeping...")
                        time.sleep(2)
                    
                    # Limit to first 100 items for initial ingestion (to avoid long waits)
                    if processed >= 100:
                        logger.info("Reached 100 item limit for initial ingestion")
                        break
                    
                except Exception as e:
                    logger.error(f"Error processing row {idx}: {e}")
                    errors += 1
                    continue
            
            os.unlink(tmp_path)
            
            # Store in database
            logger.info(f"Storing {len(items)} items in SQLite...")
            for item in items:
                db_service.upsert_recipe(item)
            
            # Vectorize
            logger.info("Generating embeddings and storing in Pinecone...")
            recipes = [Recipe(**item) for item in items]
            vectorized = vector_service.store_recipes_batch(recipes, batch_size=20)
            
            return {
                "message": f"Successfully processed {len(items)} menu items with AI-estimated nutrition",
                "stats": {
                    "total_rows": len(df),
                    "processed": processed,
                    "stored_in_db": len(items),
                    "vectorized": vectorized,
                    "errors": errors
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing URL: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.post("/recipes/upload")
    async def upload_recipes():
        """Load sample recipes (for demo purposes)."""
        from utils.recipe_data import RECIPE_DATA
        
        uploaded_count = 0
        
        for recipe_data in RECIPE_DATA:
            # Estimate nutrition using OpenAI if available
            if openai_service:
                nutrition = openai_service.estimate_nutrition(
                    recipe_data.get('name', ''),
                    recipe_data.get('description', '')
                )
                recipe_data.update({
                    'estimated_calories': nutrition['calories'],
                    'estimated_protein': nutrition['protein'],
                    'estimated_carbs': nutrition['carbs'],
                    'estimated_fat': nutrition['fat']
                })
            
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
        
        Features:
        - OpenAI text-embedding-3-large for semantic search
        - GPT-4o re-ranking with nutritional understanding
        - STRICT FILTERING: For "high protein low carb" queries, only returns items where protein > carbs
        - Smart explanations for each match
        """
        
        # Use enhanced search pipeline
        if enhanced_search:
            logger.info(f"Using OpenAI Enhanced Search for: {query.query}")
            results = enhanced_search.search(query.query, top_k=10)
            return [SearchResult(
                recipe=r['recipe'],
                match_score=r['match_score'],
                match_explanation=r['match_explanation']
            ) for r in results]
        
        # Fallback to basic vector search
        logger.info(f"Using basic search for: {query.query}")
        search_results = vector_service.search(
            query.query, 
            top_k=15,
            filters=query.filters
        )
        
        results: List[SearchResult] = []
        
        for match in search_results:
            recipe_doc = db_service.get_recipe_by_id(match['id'])
            
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                
                explanation = ExplanationService.generate_explanation(
                    query.query,
                    recipe
                )
                
                results.append(SearchResult(
                    recipe=recipe,
                    match_score=match['score'],
                    match_explanation=explanation
                ))
        
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
            with db_service.get_connection() as conn:
                conn.execute("DELETE FROM recipes")
            return {"message": "All data cleared successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    return router
