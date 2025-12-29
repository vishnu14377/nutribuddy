"""Enhanced AI search service - OPTIMIZED for speed."""

import logging
from typing import List, Dict, Any, Optional
from services.vector_service import VectorService
from services.database_service import DatabaseService
from models.recipe import Recipe

logger = logging.getLogger(__name__)


class EnhancedAISearchService:
    """Fast AI-powered search with nutritional filtering."""
    
    def __init__(
        self, 
        vector_service: VectorService, 
        db_service: DatabaseService,
        openai_api_key: str = None
    ):
        """Initialize search service."""
        self.vector_service = vector_service
        self.db_service = db_service
        logger.info("Fast AI Search Service initialized")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """Perform fast search with nutritional filtering (NO slow GPT calls).
        
        Uses:
        - OpenAI embeddings for semantic search (already computed at ingestion)
        - Local nutritional filtering (instant)
        - Local explanation generation (instant)
        """
        logger.info(f"Fast search for: '{query}'")
        
        # Step 1: Vector search (uses pre-computed embeddings, fast)
        vector_results = self.vector_service.search(query, top_k=50)
        logger.info(f"Vector search returned {len(vector_results)} candidates")
        
        if not vector_results:
            return []
        
        # Step 2: Apply nutritional filters locally (instant, no API calls)
        filtered_results = self._apply_nutritional_filters(query, vector_results)
        logger.info(f"After filtering: {len(filtered_results)} results")
        
        # Step 3: Build final results with local explanations (instant)
        final_results = []
        seen_ids = set()
        
        for result in filtered_results[:top_k]:
            recipe_id = result['id']
            
            if recipe_id in seen_ids:
                continue
            seen_ids.add(recipe_id)
            
            recipe_doc = self.db_service.get_recipe_by_id(recipe_id)
            
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                
                # Fast local explanation (no API call)
                explanation = ExplanationService.generate_explanation(query, recipe)
                
                final_results.append({
                    'recipe': recipe,
                    'match_score': result['score'],
                    'match_explanation': explanation
                })
        
        logger.info(f"Returning {len(final_results)} final results")
        return final_results
    
    def _apply_nutritional_filters(self, query: str, results: List[Dict]) -> List[Dict]:
        """Apply nutritional filters based on query (instant, no API)."""
        query_lower = query.lower()
        
        # Check for high protein, low carb type queries
        is_protein_focused = any(term in query_lower for term in [
            "high protein", "protein rich", "protein-rich", "high-protein",
            "lots of protein", "more protein", "protein heavy", "protein"
        ])
        is_low_carb = any(term in query_lower for term in [
            "low carb", "low-carb", "low carbs", "fewer carbs",
            "less carbs", "keto", "no carbs"
        ])
        
        if is_protein_focused and is_low_carb:
            # STRICT FILTER: protein must be > carbs
            filtered = []
            for result in results:
                metadata = result.get('metadata', {})
                protein = metadata.get('protein', 0) or 0
                carbs = metadata.get('carbs', 0) or 0
                
                if protein > carbs:
                    filtered.append(result)
                    logger.debug(f"✓ Kept: {metadata.get('name', 'Unknown')} P:{protein}g C:{carbs}g")
            
            if filtered:
                # Sort by protein/carb ratio
                filtered.sort(
                    key=lambda x: (x.get('metadata', {}).get('protein', 0) or 0) / max((x.get('metadata', {}).get('carbs', 0) or 1), 1),
                    reverse=True
                )
                return filtered
            
            # Fallback: return best ratios if nothing passes strict filter
            logger.warning("No items pass strict protein > carbs filter, returning best ratios")
            return sorted(
                results,
                key=lambda x: (x.get('metadata', {}).get('protein', 0) or 0) / max((x.get('metadata', {}).get('carbs', 0) or 1), 1),
                reverse=True
            )[:10]
        
        elif is_protein_focused:
            # Sort by protein content
            return sorted(
                results,
                key=lambda x: x.get('metadata', {}).get('protein', 0) or 0,
                reverse=True
            )
        
        elif is_low_carb:
            # Filter and sort by low carbs
            low_carb = [r for r in results if (r.get('metadata', {}).get('carbs', 0) or 100) < 30]
            if low_carb:
                return sorted(low_carb, key=lambda x: x.get('metadata', {}).get('carbs', 100) or 100)
            return sorted(results, key=lambda x: x.get('metadata', {}).get('carbs', 100) or 100)[:15]
        
        # Default: return by vector similarity score
        return results


class ExplanationService:
    """Fast local explanation generator (no API calls)."""
    
    @staticmethod
    def generate_explanation(query: str, recipe: Recipe) -> str:
        """Generate explanation instantly without LLM."""
        query_lower = query.lower()
        parts = []
        
        protein = recipe.estimated_protein or 0
        carbs = recipe.estimated_carbs or 0
        calories = recipe.estimated_calories or 0
        fat = recipe.estimated_fat or 0
        
        # High protein low carb specific explanation
        if ('protein' in query_lower and 'carb' in query_lower) or 'keto' in query_lower:
            ratio = protein / max(carbs, 1)
            if protein > carbs:
                parts.append(f"Excellent protein-to-carb ratio ({ratio:.1f}:1)")
            parts.append(f"{protein}g protein with only {carbs}g carbs")
            if carbs < 15:
                parts.append("keto-friendly")
            return " • ".join(parts)
        
        # Protein focused
        if 'protein' in query_lower:
            if protein >= 50:
                parts.append(f"Very high protein ({protein}g)")
            elif protein >= 30:
                parts.append(f"High protein ({protein}g)")
            else:
                parts.append(f"{protein}g protein")
        
        # Carb focused
        if 'carb' in query_lower or 'keto' in query_lower:
            if carbs < 15:
                parts.append(f"Very low carb ({carbs}g)")
            elif carbs < 30:
                parts.append(f"Low carb ({carbs}g)")
            else:
                parts.append(f"{carbs}g carbs")
        
        # Calorie focused
        if 'calor' in query_lower or 'light' in query_lower or 'diet' in query_lower:
            if calories < 400:
                parts.append(f"Light option ({calories} cal)")
            elif calories < 600:
                parts.append(f"Moderate ({calories} cal)")
            else:
                parts.append(f"{calories} calories")
        
        # Add nutritional summary if no specific matches
        if not parts:
            parts.append(f"{calories} cal • {protein}g protein • {carbs}g carbs")
        
        # Add cuisine/restaurant info
        if recipe.restaurant_name:
            parts.append(f"from {recipe.restaurant_name}")
        
        return " • ".join(parts)
