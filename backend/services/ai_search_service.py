"""
Enhanced AI Search Service with Prompt Engineering and LLM Re-ranking.

This service improves search accuracy by:
1. Query Understanding - Parse user intent and extract requirements
2. Query Expansion - Expand query with related terms
3. Hybrid Search - Combine semantic + metadata filtering
4. LLM Re-ranking - Use Gemini to re-rank results based on relevance
"""

import google.generativeai as genai
from typing import List, Dict, Any, Optional, Tuple
import json
import re
import logging
from models.recipe import Recipe

logger = logging.getLogger(__name__)


class AISearchService:
    """Enhanced AI-powered search with prompt engineering."""
    
    def __init__(self, google_api_key: str):
        """Initialize with Google API key."""
        genai.configure(api_key=google_api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        
    def understand_query(self, query: str) -> Dict[str, Any]:
        """
        Use LLM to deeply understand the user's food search query.
        
        Returns structured understanding of:
        - Intent (e.g., healthy eating, comfort food, specific cuisine)
        - Nutritional requirements (calories, protein, carbs, fat)
        - Dietary restrictions (vegetarian, vegan, gluten-free)
        - Cuisine preferences
        - Taste preferences (spicy, mild, sweet, savory)
        - Price sensitivity
        """
        
        prompt = f"""You are a food search query analyzer. Analyze this food search query and extract structured information.

User Query: "{query}"

Extract the following information (use null if not mentioned):

1. **intent**: What is the user looking for? (e.g., "healthy meal", "comfort food", "quick dinner", "high protein", "low calorie", "specific cuisine")

2. **nutrition_requirements**:
   - max_calories: number or null (e.g., "under 500 cal" → 500)
   - min_calories: number or null
   - min_protein: number in grams or null (e.g., "high protein" → 25, "30g protein" → 30)
   - max_protein: number or null
   - max_carbs: number or null (e.g., "low carb" → 30, "keto" → 20)
   - max_fat: number or null

3. **dietary_preferences**: List of dietary tags like ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Keto", "Low Carb", "High Protein", "Low Calorie"]

4. **cuisine_preferences**: List of cuisines like ["Indian", "Chinese", "Mexican", "Italian", "Thai", "Japanese", "American", "Mediterranean"]

5. **taste_preferences**:
   - spice_level: "Mild", "Medium Spicy", "Spicy", "Very Spicy", or null
   - flavor_profile: List like ["sweet", "savory", "tangy", "creamy", "crispy"]

6. **price_range**:
   - max_price: number or null
   - preference: "budget", "moderate", "premium", or null

7. **expanded_search_terms**: List of 5-10 related food terms that would help find relevant items
   (e.g., for "high protein" → ["chicken", "beef", "fish", "eggs", "tofu", "protein bowl", "grilled meat", "steak"])

8. **negative_terms**: Things to avoid based on the query (e.g., "vegetarian" → avoid "beef", "chicken", "pork")

Respond ONLY with valid JSON, no markdown:
{{
  "intent": "string",
  "nutrition_requirements": {{
    "max_calories": number or null,
    "min_calories": number or null,
    "min_protein": number or null,
    "max_protein": number or null,
    "max_carbs": number or null,
    "max_fat": number or null
  }},
  "dietary_preferences": ["string"],
  "cuisine_preferences": ["string"],
  "taste_preferences": {{
    "spice_level": "string or null",
    "flavor_profile": ["string"]
  }},
  "price_range": {{
    "max_price": number or null,
    "preference": "string or null"
  }},
  "expanded_search_terms": ["string"],
  "negative_terms": ["string"]
}}"""

        try:
            response = self.model.generate_content(prompt)
            text = response.text.strip()
            
            # Clean up response - remove markdown code blocks if present
            if text.startswith('```'):
                text = re.sub(r'^```json?\n?', '', text)
                text = re.sub(r'\n?```$', '', text)
            
            result = json.loads(text)
            logger.info(f"Query understanding: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error understanding query: {e}")
            # Return basic understanding
            return {
                "intent": "general search",
                "nutrition_requirements": {},
                "dietary_preferences": [],
                "cuisine_preferences": [],
                "taste_preferences": {"spice_level": None, "flavor_profile": []},
                "price_range": {"max_price": None, "preference": None},
                "expanded_search_terms": [query],
                "negative_terms": []
            }
    
    def create_enhanced_query(self, query: str, understanding: Dict[str, Any]) -> str:
        """
        Create an enhanced search query based on understanding.
        This query will be embedded for vector search.
        """
        parts = [query]
        
        # Add expanded terms
        if understanding.get('expanded_search_terms'):
            parts.extend(understanding['expanded_search_terms'][:5])
        
        # Add dietary preferences
        if understanding.get('dietary_preferences'):
            parts.extend(understanding['dietary_preferences'])
        
        # Add cuisine preferences
        if understanding.get('cuisine_preferences'):
            parts.extend(understanding['cuisine_preferences'])
        
        # Add nutrition context
        nutrition = understanding.get('nutrition_requirements', {})
        if nutrition.get('min_protein') and nutrition['min_protein'] >= 20:
            parts.append("high protein content protein-rich")
        if nutrition.get('max_calories') and nutrition['max_calories'] <= 500:
            parts.append("low calorie light healthy")
        if nutrition.get('max_carbs') and nutrition['max_carbs'] <= 30:
            parts.append("low carb keto friendly")
        
        # Add taste preferences
        taste = understanding.get('taste_preferences', {})
        if taste.get('spice_level'):
            parts.append(taste['spice_level'])
        
        enhanced_query = ' '.join(parts)
        logger.info(f"Enhanced query: {enhanced_query}")
        return enhanced_query
    
    def build_metadata_filters(self, understanding: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build Pinecone metadata filters from query understanding.
        """
        filters = {}
        
        nutrition = understanding.get('nutrition_requirements', {})
        
        # Calorie filter
        if nutrition.get('max_calories'):
            filters['max_calories'] = nutrition['max_calories']
        
        # Protein filter (for high protein queries)
        if nutrition.get('min_protein') and nutrition['min_protein'] >= 20:
            filters['min_protein'] = nutrition['min_protein']
        
        # Carb filter (for low carb/keto)
        if nutrition.get('max_carbs'):
            filters['max_carbs'] = nutrition['max_carbs']
        
        # Spice level filter
        taste = understanding.get('taste_preferences', {})
        if taste.get('spice_level'):
            filters['spice_level'] = taste['spice_level']
        
        # Price filter
        price = understanding.get('price_range', {})
        if price.get('max_price'):
            filters['max_price'] = price['max_price']
        
        return filters
    
    def rerank_results(
        self, 
        query: str, 
        understanding: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Use LLM to re-rank search results based on relevance to user query.
        This is the key improvement for accuracy.
        """
        
        if not candidates:
            return []
        
        # Prepare candidate summaries for LLM
        candidate_summaries = []
        for i, c in enumerate(candidates[:20]):  # Limit to top 20 for re-ranking
            recipe = c.get('recipe_data', {})
            summary = {
                "index": i,
                "name": recipe.get('name', 'Unknown'),
                "cuisine": recipe.get('cuisine_type', 'Unknown'),
                "calories": recipe.get('estimated_calories', 0),
                "protein": recipe.get('estimated_protein', 0),
                "carbs": recipe.get('estimated_carbs', 0),
                "fat": recipe.get('estimated_fat', 0),
                "spice": recipe.get('spice_level', 'Mild'),
                "dietary_tags": recipe.get('dietary_tags', []),
                "price": recipe.get('price', 0),
                "description": recipe.get('description', '')[:100]
            }
            candidate_summaries.append(summary)
        
        prompt = f"""You are a food recommendation expert. Re-rank these menu items based on how well they match the user's search.

USER QUERY: "{query}"

USER REQUIREMENTS (extracted):
- Intent: {understanding.get('intent', 'general')}
- Nutrition needs: {json.dumps(understanding.get('nutrition_requirements', {}))}
- Dietary preferences: {understanding.get('dietary_preferences', [])}
- Cuisine preferences: {understanding.get('cuisine_preferences', [])}
- Taste preferences: {json.dumps(understanding.get('taste_preferences', {}))}
- Things to avoid: {understanding.get('negative_terms', [])}

CANDIDATE MENU ITEMS:
{json.dumps(candidate_summaries, indent=2)}

TASK: Re-rank these items from MOST RELEVANT to LEAST RELEVANT based on the user's query and requirements.

Consider:
1. Does it match the nutritional requirements? (calories, protein, carbs)
2. Does it match dietary preferences? (vegetarian, vegan, etc.)
3. Does it match cuisine preferences?
4. Does it match taste/spice preferences?
5. Is it semantically related to what the user wants?

Return ONLY a JSON array of indices in order of relevance, with a relevance score (0-100) and brief reason:
[
  {{"index": 0, "score": 95, "reason": "High protein chicken dish, matches low carb requirement"}},
  {{"index": 3, "score": 88, "reason": "Vegetarian option with good protein content"}},
  ...
]

Return the top {top_k} most relevant items only. Respond with valid JSON only, no markdown."""

        try:
            response = self.model.generate_content(prompt)
            text = response.text.strip()
            
            # Clean up response
            if text.startswith('```'):
                text = re.sub(r'^```json?\n?', '', text)
                text = re.sub(r'\n?```$', '', text)
            
            rankings = json.loads(text)
            
            # Reorder candidates based on LLM ranking
            reranked = []
            for rank in rankings[:top_k]:
                idx = rank.get('index', 0)
                if idx < len(candidates):
                    candidate = candidates[idx].copy()
                    candidate['rerank_score'] = rank.get('score', 50)
                    candidate['rerank_reason'] = rank.get('reason', '')
                    reranked.append(candidate)
            
            logger.info(f"Re-ranked {len(reranked)} results")
            return reranked
            
        except Exception as e:
            logger.error(f"Error re-ranking: {e}")
            # Return original order if re-ranking fails
            return candidates[:top_k]
    
    def generate_match_explanation(
        self, 
        query: str, 
        understanding: Dict[str, Any],
        recipe: Recipe,
        rerank_reason: str = ""
    ) -> str:
        """
        Generate a detailed, accurate explanation of why this item matches.
        """
        
        prompt = f"""Generate a brief, accurate explanation (1-2 sentences) for why this menu item matches the user's search.

USER QUERY: "{query}"
USER INTENT: {understanding.get('intent', 'general food search')}

MENU ITEM:
- Name: {recipe.name}
- Cuisine: {recipe.cuisine_type}
- Calories: {recipe.estimated_calories} kcal
- Protein: {recipe.estimated_protein}g
- Carbs: {recipe.estimated_carbs}g
- Fat: {recipe.estimated_fat}g
- Spice Level: {recipe.spice_level}
- Dietary Tags: {recipe.dietary_tags}
- Price: ${recipe.price}

{f"RE-RANKING REASON: {rerank_reason}" if rerank_reason else ""}

Write a natural, helpful explanation that highlights the specific attributes that match the user's needs.
Focus on concrete numbers and facts. Be specific, not generic.

Example good explanations:
- "High protein option with 45g protein per serving, perfect for muscle building"
- "Only 320 calories and vegetarian-friendly, ideal for your healthy eating goal"
- "Authentic Thai cuisine with medium spice level as requested"

Respond with just the explanation text, no quotes or formatting."""

        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"Error generating explanation: {e}")
            # Fallback to basic explanation
            parts = []
            if recipe.estimated_protein and recipe.estimated_protein >= 25:
                parts.append(f"High protein ({recipe.estimated_protein}g)")
            if recipe.estimated_calories:
                parts.append(f"{recipe.estimated_calories} calories")
            if recipe.cuisine_type:
                parts.append(f"{recipe.cuisine_type} cuisine")
            return ". ".join(parts) if parts else f"Matches your search for {query}"


class EnhancedSearchPipeline:
    """
    Complete enhanced search pipeline combining all AI improvements.
    """
    
    def __init__(self, vector_service, db_service, google_api_key: str):
        self.vector_service = vector_service
        self.db_service = db_service
        self.ai_service = AISearchService(google_api_key)
    
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Execute enhanced search pipeline:
        1. Understand query with LLM
        2. Create enhanced query for embeddings
        3. Search with metadata filters
        4. Re-rank results with LLM
        5. Generate accurate explanations
        """
        
        logger.info(f"Enhanced search for: {query}")
        
        # Step 1: Understand query
        understanding = self.ai_service.understand_query(query)
        
        # Step 2: Create enhanced query
        enhanced_query = self.ai_service.create_enhanced_query(query, understanding)
        
        # Step 3: Build filters
        filters = self.ai_service.build_metadata_filters(understanding)
        
        # Step 4: Vector search (get more candidates for re-ranking)
        vector_results = self.vector_service.search(
            enhanced_query, 
            top_k=30,  # Get more for re-ranking
            filters=filters if filters else None
        )
        
        # Step 5: Fetch full recipe data
        candidates = []
        for result in vector_results:
            recipe_data = self.db_service.get_recipe_by_id(result['id'])
            if recipe_data:
                candidates.append({
                    'id': result['id'],
                    'vector_score': result['score'],
                    'recipe_data': recipe_data
                })
        
        # Step 6: Re-rank with LLM
        reranked = self.ai_service.rerank_results(
            query, understanding, candidates, top_k=top_k
        )
        
        # Step 7: Generate explanations and build final results
        final_results = []
        for item in reranked:
            recipe = Recipe(**item['recipe_data'])
            
            # Use LLM-generated explanation
            explanation = self.ai_service.generate_match_explanation(
                query, 
                understanding, 
                recipe,
                item.get('rerank_reason', '')
            )
            
            # Calculate final score (combine vector + rerank scores)
            vector_score = item.get('vector_score', 0.5)
            rerank_score = item.get('rerank_score', 50) / 100
            final_score = (vector_score * 0.4) + (rerank_score * 0.6)
            
            final_results.append({
                'recipe': recipe,
                'match_score': final_score,
                'match_explanation': explanation
            })
        
        logger.info(f"Returning {len(final_results)} enhanced results")
        return final_results
