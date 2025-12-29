"""Enhanced AI search service using OpenAI for query understanding and re-ranking."""

import logging
from typing import List, Dict, Any, Optional
from services.openai_service import OpenAIService
from services.vector_service import VectorService
from services.database_service import DatabaseService
from models.recipe import Recipe

logger = logging.getLogger(__name__)


class EnhancedAISearchService:
    """AI-powered search with OpenAI for query understanding and re-ranking."""
    
    def __init__(
        self, 
        vector_service: VectorService, 
        db_service: DatabaseService,
        openai_api_key: str
    ):
        """Initialize enhanced search service.
        
        Args:
            vector_service: Vector search service
            db_service: Database service for retrieving full records
            openai_api_key: OpenAI API key
        """
        self.vector_service = vector_service
        self.db_service = db_service
        self.openai_service = OpenAIService(api_key=openai_api_key)
        logger.info("Enhanced AI Search Service initialized with OpenAI")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """Perform enhanced search with OpenAI re-ranking and strict nutritional filtering.
        
        Args:
            query: User's natural language search query
            top_k: Number of results to return
            
        Returns:
            List of search results with recipes, scores, and explanations
        """
        logger.info(f"Enhanced search for: '{query}'")
        
        # Step 1: Initial vector search - get more candidates than needed
        vector_results = self.vector_service.search(query, top_k=30)
        logger.info(f"Vector search returned {len(vector_results)} candidates")
        
        if not vector_results:
            return []
        
        # Step 2: Re-rank with OpenAI and apply strict nutritional filters
        reranked_results = self.openai_service.rerank_results(
            query=query,
            results=vector_results,
            enforce_nutrition_filter=True
        )
        logger.info(f"After re-ranking and filtering: {len(reranked_results)} results")
        
        # Step 3: Build final results with full recipe data and explanations
        final_results = []
        seen_ids = set()  # Deduplication
        
        for result in reranked_results[:top_k]:
            recipe_id = result['id']
            
            # Skip duplicates
            if recipe_id in seen_ids:
                continue
            seen_ids.add(recipe_id)
            
            # Get full recipe from database
            recipe_doc = self.db_service.get_recipe_by_id(recipe_id)
            
            if recipe_doc:
                recipe = Recipe(**recipe_doc)
                
                # Generate match explanation
                metadata = result.get('metadata', {})
                explanation = self.openai_service.generate_match_explanation(
                    query=query,
                    item_metadata={
                        'name': recipe.name,
                        'protein': recipe.estimated_protein,
                        'carbs': recipe.estimated_carbs,
                        'calories': recipe.estimated_calories,
                        'fat': recipe.estimated_fat
                    }
                )
                
                final_results.append({
                    'recipe': recipe,
                    'match_score': result['score'],
                    'match_explanation': explanation
                })
        
        logger.info(f"Returning {len(final_results)} final results")
        return final_results


class ExplanationService:
    """Service for generating match explanations."""
    
    @staticmethod
    def generate_explanation(query: str, recipe: Recipe) -> str:
        """Generate a basic explanation without LLM (fallback).
        
        Args:
            query: User's search query
            recipe: Recipe object
            
        Returns:
            Explanation string
        """
        query_lower = query.lower()
        explanations = []
        
        # Check for protein mentions
        if 'protein' in query_lower:
            protein = recipe.estimated_protein or 0
            if protein >= 30:
                explanations.append(f"High protein ({protein}g)")
            elif protein >= 20:
                explanations.append(f"Good protein source ({protein}g)")
            else:
                explanations.append(f"Contains {protein}g protein")
        
        # Check for carb mentions
        if 'carb' in query_lower or 'keto' in query_lower:
            carbs = recipe.estimated_carbs or 0
            if carbs < 15:
                explanations.append(f"Very low carb ({carbs}g)")
            elif carbs < 30:
                explanations.append(f"Low carb ({carbs}g)")
            else:
                explanations.append(f"Contains {carbs}g carbs")
        
        # Check for calorie mentions
        if 'calor' in query_lower or 'light' in query_lower:
            calories = recipe.estimated_calories or 0
            if calories < 400:
                explanations.append(f"Light option ({calories} cal)")
            elif calories < 600:
                explanations.append(f"Moderate calories ({calories} cal)")
            else:
                explanations.append(f"{calories} calories")
        
        # Add cuisine if relevant
        if recipe.cuisine_type:
            explanations.append(f"{recipe.cuisine_type} cuisine")
        
        # Default explanation
        if not explanations:
            explanations.append(f"Matches your search for '{query}'")
        
        return " • ".join(explanations)
