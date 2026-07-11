"""Nutribuddy API routes - AI-powered nutritional search."""

from fastapi import APIRouter, Depends, Header, HTTPException
from typing import List, Optional
import tempfile
import time
import os
import logging

import requests

from models.recipe import Recipe, SearchQuery, SearchResult
from services.database_service import DatabaseService
from services.vector_service import VectorService
from services.ai_search_service import EnhancedAISearchService, ExplanationService
from services.openai_service import OpenAIService
from services.data_ingestion_service import DataIngestionService

logger = logging.getLogger(__name__)


def require_admin(x_admin_token: Optional[str] = Header(None)):
    """Guard destructive endpoints.

    When ADMIN_API_TOKEN is set, the X-Admin-Token header must match.
    When it is unset, access is allowed (preserves the current local-dev flow).
    """
    expected = os.environ.get('ADMIN_API_TOKEN')
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Admin token required")


def create_recipe_router(
    db_service: DatabaseService,
    vector_service: VectorService,
    openai_api_key: str = None,
    default_currency: str = None,
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

    def _replace_sources(items: List[Recipe]) -> None:
        """Per-source replace: wipe only the platforms present in this payload.

        Pinecone serverless can't delete by metadata filter, so vector deletion
        is ID-driven with SQLite as the ID source of truth: read IDs first,
        delete those vectors, THEN delete the SQLite rows.
        """
        for platform in {item.source_platform for item in items}:
            ids = db_service.get_ids_by_source(platform)
            if ids:
                vector_service.delete_by_ids(ids)
                db_service.clear_source(platform)
                logger.info(f"Replaced source '{platform}': removed {len(ids)} existing items")

    def _apply_default_currency(items: List[Recipe]) -> None:
        defaulted = sum(1 for item in items if item.currency is None)
        if defaulted and default_currency:
            for item in items:
                if item.currency is None:
                    item.currency = default_currency
            logger.warning(f"{defaulted} items ingested without explicit currency; defaulted to {default_currency}")
        elif defaulted:
            logger.warning(f"{defaulted} items ingested without explicit currency (no DEFAULT_CURRENCY set; stored as unknown)")

    @router.get("/stats")
    async def get_stats():
        """Get database statistics."""
        return {
            "database": {
                "count": db_service.get_count(),
                "platforms": db_service.get_platform_counts(),
            },
            "vector_store": vector_service.get_index_stats(),
            "engine": "OpenAI embeddings + nutritional filtering"
        }

    @router.post("/ingest/items", dependencies=[Depends(require_admin)])
    async def ingest_items(items: List[Recipe], replace: bool = True):
        """Bulk-ingest pre-structured items whose nutrition is already known.

        Contract: price = MAJOR currency units (12.99 == $12.99); currency =
        ISO 4217 uppercase; omitted currency falls back to the DEFAULT_CURRENCY
        env var, else is stored as unknown. No GPT estimation — nutrition
        values are trusted as supplied. Used by external apps (e.g. BiteRush)
        and fixture seeding to push catalogs.

        replace=True replaces ONLY the source platforms present in the payload;
        other platforms' data is untouched.
        """
        if not items:
            raise HTTPException(status_code=400, detail="No items provided")
        _apply_default_currency(items)
        if replace:
            _replace_sources(items)
        for recipe in items:
            db_service.upsert_recipe(recipe.model_dump())
        stored = vector_service.store_recipes_batch(items, batch_size=50)
        return {"message": f"Ingested {len(items)} items", "count": len(items), "vectors_stored": stored}

    @router.post("/ingest/url", dependencies=[Depends(require_admin)])
    async def ingest_from_url(url: str, limit: int = 200):
        """Import menu data from an Apify Uber Eats Excel export URL.

        Prices are normalized to major USD units at this boundary; nutrition
        is estimated per item via GPT. Replaces only the 'ubereats' source.
        """
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
                        time.sleep(1)
                except Exception as e:
                    logger.error(f"Error: {e}")

            recipes = [Recipe(**item) for item in items]
            _replace_sources(recipes)
            for recipe in recipes:
                db_service.upsert_recipe(recipe.model_dump())
            vector_service.store_recipes_batch(recipes, batch_size=50)

            return {"message": f"Imported {len(items)} items", "count": len(items)}

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/search", response_model=List[SearchResult])
    async def search(query: SearchQuery):
        """AI-powered nutritional search.

        Optional narrowing: restaurant_name (fuzzy, post-filter) and
        source_platform (exact, Pinecone metadata filter).
        """
        if enhanced_search:
            results = enhanced_search.search(
                query.query,
                top_k=10,
                restaurant_filter=query.restaurant_name,
                platform_filter=query.source_platform,
            )
            return [SearchResult(
                recipe=r['recipe'],
                match_score=r['match_score'],
                match_explanation=r['match_explanation']
            ) for r in results]

        filters = {'platform': query.source_platform} if query.source_platform else None
        search_results = vector_service.search(query.query, top_k=15, filters=filters)

        # Batch fetch all recipes (avoids N+1 queries)
        recipe_ids = [match['id'] for match in search_results]
        recipe_docs = db_service.get_recipes_by_ids(recipe_ids)
        recipes_dict = {doc['id']: doc for doc in recipe_docs}

        results = []
        for match in search_results:
            recipe_doc = recipes_dict.get(match['id'])
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

    @router.delete("/recipes/clear", dependencies=[Depends(require_admin)])
    async def clear_all():
        """Clear ALL data across every platform (the only nuke-everything endpoint)."""
        vector_service.clear_index()
        db_service.clear_all()
        return {"message": "Cleared"}

    return router
