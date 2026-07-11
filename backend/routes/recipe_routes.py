"""Nutribuddy API routes - AI-powered nutritional search."""

from fastapi import APIRouter, Depends, Header, HTTPException
from typing import List, Optional
from urllib.parse import urlparse
import ipaddress
import secrets
import tempfile
import time
import os
import logging

import requests

from pydantic import BaseModel, Field

from models.recipe import Recipe, SearchQuery, SearchResult
from services.database_service import DatabaseService
from services.vector_service import VectorService
from services.ai_search_service import EnhancedAISearchService, ExplanationService
from services.location_service import (
    GeocodeUnavailable, InvalidZipcode, geocode_zip, haversine_km,
)
from services.openai_service import OpenAIService
from services.data_ingestion_service import DataIngestionService


class AskQuery(BaseModel):
    """A question for the food-scoped assistant."""

    question: str = Field(min_length=1, max_length=1000)

logger = logging.getLogger(__name__)


def require_admin(x_admin_token: Optional[str] = Header(None)):
    """Guard destructive endpoints.

    When ADMIN_API_TOKEN is set, the X-Admin-Token header must match.
    When it is unset, access is allowed (preserves the current local-dev flow).
    """
    expected = os.environ.get('ADMIN_API_TOKEN')
    if expected and not secrets.compare_digest(x_admin_token or '', expected):
        raise HTTPException(status_code=403, detail="Admin token required")


def require_admin_strict(x_admin_token: Optional[str] = Header(None)):
    """Like require_admin, but the endpoint is DISABLED until a token is set.

    Used for /api/ingest/url, which fetches a caller-supplied URL server-side
    (SSRF surface) — it must never be reachable unauthenticated.
    """
    expected = os.environ.get('ADMIN_API_TOKEN')
    if not expected:
        raise HTTPException(
            status_code=403,
            detail="Endpoint disabled: set ADMIN_API_TOKEN to enable URL ingestion"
        )
    if not secrets.compare_digest(x_admin_token or '', expected):
        raise HTTPException(status_code=403, detail="Admin token required")


def _reject_unsafe_url(url: str) -> None:
    """Basic SSRF guard: https only, no private/loopback/link-local hosts.

    Not a complete defense (no post-resolution re-check) — the endpoint is
    additionally admin-token-gated via require_admin_strict.
    """
    parsed = urlparse(url)
    if parsed.scheme != 'https':
        raise HTTPException(status_code=400, detail="Only https:// URLs are allowed")
    host = parsed.hostname or ''
    if host in ('localhost',) or host.endswith('.local') or host.endswith('.internal'):
        raise HTTPException(status_code=400, detail="Host not allowed")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=400, detail="Host not allowed")
    except ValueError:
        pass  # hostname, not an IP literal


def create_recipe_router(
    db_service: DatabaseService,
    vector_service: VectorService,
    openai_api_key: str = None,
    default_currency: str = None,
) -> APIRouter:
    """Create recipe router."""
    # Fail fast on a misconfigured DEFAULT_CURRENCY: an invalid code written
    # into the DB would 500 every read path until manually scrubbed.
    if default_currency:
        try:
            default_currency = Recipe.validate_currency(default_currency)
        except ValueError as e:
            raise ValueError(f"Invalid DEFAULT_CURRENCY env var: {e}") from e

    if not os.environ.get('ADMIN_API_TOKEN'):
        logger.warning("ADMIN_API_TOKEN is unset: ingest/clear endpoints are open (local-dev mode) "
                       "and /api/ingest/url is disabled")

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

    def _store_with_replace(items: List[Recipe], replace: bool) -> int:
        """Ingest items new-data-first so failure never destroys existing data.

        Order: (1) index new vectors; on partial failure, roll the new vectors
        back and abort with 502 — the old catalog is untouched. (2) Only after
        full success, delete the replaced platforms' old vectors (ID-driven:
        Pinecone serverless has no metadata-filtered delete; SQLite is the ID
        source of truth) and rows, then upsert the new rows.
        """
        new_ids = {item.id for item in items}
        stored = vector_service.store_recipes_batch(items, batch_size=50)
        if stored < len(items):
            vector_service.delete_by_ids(list(new_ids))
            raise HTTPException(
                status_code=502,
                detail=f"Vector indexing failed ({stored}/{len(items)} stored); "
                       f"ingest aborted, existing data untouched"
            )
        if replace:
            for platform in {item.source_platform for item in items}:
                old_ids = [i for i in db_service.get_ids_by_source(platform) if i not in new_ids]
                if old_ids:
                    vector_service.delete_by_ids(old_ids)
                logger.info(f"Replaced source '{platform}': removed {len(old_ids)} existing items")
                db_service.clear_source(platform)
        for recipe in items:
            db_service.upsert_recipe(recipe.model_dump())
        return stored

    def _guard_suspicious_replace(items: List[Recipe], force: bool) -> None:
        """A small delta push with replace=True would silently destroy a whole
        platform catalog — require explicit force for shrinks over 50%."""
        if force:
            return
        by_platform = {}
        for item in items:
            by_platform.setdefault(item.source_platform, 0)
            by_platform[item.source_platform] += 1
        for platform, new_count in by_platform.items():
            old_count = len(db_service.get_ids_by_source(platform))
            if old_count >= 10 and new_count < old_count * 0.5:
                raise HTTPException(
                    status_code=409,
                    detail=f"replace=true would shrink '{platform}' from {old_count} to "
                           f"{new_count} items. If intended, retry with force=true; "
                           f"for incremental additions use replace=false."
                )

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
    async def ingest_items(items: List[Recipe], replace: bool = True, force: bool = False):
        """Bulk-ingest pre-structured items whose nutrition is already known.

        Contract: price = MAJOR currency units (12.99 == $12.99); currency =
        ISO 4217 uppercase; omitted currency falls back to the DEFAULT_CURRENCY
        env var, else is stored as unknown. No GPT estimation — nutrition
        values are trusted as supplied. Used by external apps (e.g. BiteRush)
        and fixture seeding to push catalogs.

        replace=True replaces ONLY the source platforms present in the payload;
        other platforms' data is untouched. A payload that would shrink a
        platform by more than half is rejected unless force=true.
        """
        if not items:
            raise HTTPException(status_code=400, detail="No items provided")
        _apply_default_currency(items)
        if replace:
            _guard_suspicious_replace(items, force)
        stored = _store_with_replace(items, replace)
        return {"message": f"Ingested {len(items)} items", "count": len(items), "vectors_stored": stored}

    @router.post("/ingest/url", dependencies=[Depends(require_admin_strict)])
    async def ingest_from_url(url: str, limit: int = 200):
        """Import menu data from an Apify Uber Eats Excel export URL.

        Requires ADMIN_API_TOKEN to be configured (the server fetches a
        caller-supplied URL). Prices are normalized to major USD units at this
        boundary; nutrition is estimated per item via GPT. Replaces only the
        'ubereats' source.
        """
        if not openai_service:
            raise HTTPException(status_code=500, detail="OpenAI not configured")

        _reject_unsafe_url(url)

        tmp_path = None
        try:
            response = requests.get(url, timeout=120)
            response.raise_for_status()

            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name

            raw_items = DataIngestionService.extract_menu_items_from_excel(tmp_path, limit=limit)

            if not raw_items:
                raise HTTPException(status_code=400, detail="No items found")

            items = []
            for i, raw_item in enumerate(raw_items):
                try:
                    nutrition = openai_service.estimate_nutrition(
                        raw_item['name'],
                        raw_item.get('description', ''),
                        restaurant_name=raw_item.get('restaurant_name', ''),
                        price=raw_item.get('price'),
                        currency=raw_item.get('currency', ''),
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
            stored = _store_with_replace(recipes, replace=True)

            return {"message": f"Imported {len(items)} items", "count": len(items), "vectors_stored": stored}

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @router.post("/search", response_model=List[SearchResult])
    async def search(query: SearchQuery):
        """AI-powered nutritional search.

        Optional narrowing: restaurant_name (fuzzy, post-filter) and
        source_platform (exact, Pinecone metadata filter).
        """
        if query.source_platform:
            known = db_service.get_platform_counts()
            if query.source_platform not in known:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown source_platform '{query.source_platform}'. "
                           f"Available: {sorted(known)}"
                )
        if query.restaurant_name:
            names = db_service.get_restaurant_names()
            wanted = query.restaurant_name.lower()
            if not any(wanted in n.lower() for n in names):
                import difflib
                close = difflib.get_close_matches(query.restaurant_name, names, n=3, cutoff=0.5)
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown restaurant '{query.restaurant_name}'."
                           + (f" Did you mean: {', '.join(close)}?" if close else "")
                )
        if enhanced_search:
            try:
                results = enhanced_search.search(
                    query.query,
                    top_k=10,
                    restaurant_filter=query.restaurant_name,
                    platform_filter=query.source_platform,
                )
            except Exception as e:
                # Never surface a bare 500 from the search path
                logger.error(f"Search failed for '{query.query[:80]}': {e}")
                raise HTTPException(status_code=502, detail="Search backend error; please retry")
            return [SearchResult(
                recipe=r['recipe'],
                match_score=r['match_score'],
                match_explanation=r['match_explanation'],
                meets_constraints=r.get('meets_constraints', True),
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

    @router.get("/restaurants/nearby")
    async def restaurants_nearby(zipcode: str, radius_km: float = 25, limit: int = 12,
                                 source_platform: Optional[str] = None):
        """Restaurants near a US zipcode, from the indexed catalog.

        Query-time proximity uses stored coordinates — live scraping is an
        ingest-time operation (see scripts/ingest_zipcode.py), never done here.
        """
        try:
            lat, lon = geocode_zip(zipcode)
        except InvalidZipcode as e:
            raise HTTPException(status_code=422, detail=str(e))
        except GeocodeUnavailable as e:
            raise HTTPException(status_code=502, detail=str(e))

        source_platform = (source_platform or '').strip().lower() or None
        if source_platform:
            known = db_service.get_platform_counts()
            if source_platform not in known:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown source_platform '{source_platform}'. Available: {sorted(known)}")

        nearby = []
        for r in db_service.get_restaurants_with_locations():
            if source_platform and r['source_platform'] != source_platform:
                continue
            distance = haversine_km(lat, lon, r['latitude'], r['longitude'])
            if distance <= radius_km:
                nearby.append({
                    'restaurant_name': r['restaurant_name'],
                    'distance_km': round(distance, 1),
                    'item_count': r['item_count'],
                    'source_platform': r['source_platform'],
                    'cuisine_type': r['cuisine_type'],
                    'postal_code': r['postal_code'],
                })
        nearby.sort(key=lambda r: r['distance_km'])
        return {'zipcode': zipcode, 'radius_km': radius_km, 'restaurants': nearby[:limit]}

    @router.post("/ask")
    async def ask(query: AskQuery):
        """Food-scoped assistant: answers food/nutrition questions grounded in
        the catalog; politely refuses anything off-topic."""
        if not openai_service:
            raise HTTPException(status_code=503, detail="Assistant not configured")

        # Ground the answer in the most relevant catalog dishes. Items that
        # fail the question's constraints (meets_constraints=False) are NEVER
        # offered to the model as recommendation candidates — the assistant
        # once told a vegetarian an untagged poke bowl was vegetarian.
        context_items = []
        supporting = []
        if enhanced_search:
            try:
                results = enhanced_search.search(query.question, top_k=5)
                qualified = [r for r in results if r.get('meets_constraints', True)]
                context_items = [{
                    **r['recipe'].model_dump(),
                    'dietary_tags': r['recipe'].dietary_tags or [],
                } for r in qualified]
                supporting = [SearchResult(
                    recipe=r['recipe'],
                    match_score=r['match_score'],
                    match_explanation=r['match_explanation'],
                    meets_constraints=r.get('meets_constraints', True),
                ) for r in (qualified or results)[:3]]
            except Exception as e:
                logger.warning(f"Ask grounding search failed (continuing without): {e}")

        reply = openai_service.answer_food_question(query.question, context_items)
        return {
            'answer': reply['answer'],
            'on_topic': reply['on_topic'],
            'results': supporting if reply['on_topic'] else [],
        }

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
