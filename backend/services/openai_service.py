"""OpenAI service for embeddings and nutrition estimation."""

import openai
from typing import List, Dict, Any, Optional
import os
import logging
import json

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for OpenAI embeddings and GPT-based nutrition estimation."""
    
    def __init__(self, api_key: str):
        """Initialize OpenAI service.
        
        Args:
            api_key: OpenAI API key
        """
        self.client = openai.OpenAI(api_key=api_key)
        self.embedding_model = "text-embedding-3-large"
        self.embedding_dimensions = 1536  # Reduced for efficiency, still excellent performance
        self.chat_model = "gpt-4o"
        logger.info(f"OpenAI Service initialized with model: {self.embedding_model}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector using OpenAI.
        
        Args:
            text: Text to embed
            
        Returns:
            List of embedding values (1536 dimensions)
        """
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
                dimensions=self.embedding_dimensions
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise
    
    def estimate_nutrition(self, name: str, description: str = "") -> Dict[str, Any]:
        """Estimate nutritional values for a menu item using GPT-4o.
        
        Args:
            name: Menu item name
            description: Menu item description
            
        Returns:
            Dictionary with estimated calories, protein, carbs, fat
        """
        prompt = f"""You are a nutrition expert. Estimate the nutritional values for this menu item.

Menu Item: {name}
Description: {description if description else 'No description available'}

Provide your best estimate for a typical serving size. Be realistic based on common restaurant portions.

Respond in JSON format ONLY with these fields:
{{
    "calories": <integer>,
    "protein": <integer in grams>,
    "carbs": <integer in grams>,
    "fat": <integer in grams>,
    "dietary_tags": [<list of applicable tags like "high-protein", "low-carb", "vegetarian", "vegan", "gluten-free", "keto-friendly">],
    "confidence": "<low/medium/high>"
}}

Consider:
- Pizza slices are typically 250-350 calories
- Wings (10pc) are typically 800-1200 calories with 80-100g protein
- Pasta dishes are typically 600-1000 calories
- Sandwiches/subs are typically 400-800 calories
- Salads without heavy dressing are typically 200-500 calories

Only output the JSON, nothing else."""

        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a nutrition expert. Respond only with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=300
            )
            
            content = response.choices[0].message.content.strip()
            # Handle potential markdown code blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            nutrition = json.loads(content)
            return {
                "calories": int(nutrition.get("calories", 500)),
                "protein": int(nutrition.get("protein", 20)),
                "carbs": int(nutrition.get("carbs", 40)),
                "fat": int(nutrition.get("fat", 20)),
                "dietary_tags": nutrition.get("dietary_tags", []),
                "confidence": nutrition.get("confidence", "medium")
            }
            
        except Exception as e:
            logger.error(f"Error estimating nutrition for '{name}': {e}")
            # Return reasonable defaults
            return {
                "calories": 500,
                "protein": 20,
                "carbs": 40,
                "fat": 20,
                "dietary_tags": [],
                "confidence": "low"
            }
    
    def rerank_results(
        self, 
        query: str, 
        results: List[Dict[str, Any]], 
        enforce_nutrition_filter: bool = True
    ) -> List[Dict[str, Any]]:
        """Re-rank search results using GPT-4o with strict nutritional filtering.
        
        Args:
            query: User's search query
            results: List of search results with metadata
            enforce_nutrition_filter: Whether to apply hard nutritional filters
            
        Returns:
            Re-ranked and filtered results
        """
        if not results:
            return []
        
        # First, apply hard nutritional filters based on query
        query_lower = query.lower()
        filtered_results = results
        
        if enforce_nutrition_filter:
            # Check for high protein, low carb type queries
            is_protein_focused = any(term in query_lower for term in [
                "high protein", "protein rich", "protein-rich", "high-protein",
                "lots of protein", "more protein", "protein heavy"
            ])
            is_low_carb = any(term in query_lower for term in [
                "low carb", "low-carb", "low carbs", "fewer carbs",
                "less carbs", "keto", "no carbs"
            ])
            
            if is_protein_focused and is_low_carb:
                # STRICT FILTER: protein must be greater than carbs
                filtered_results = []
                for result in results:
                    metadata = result.get('metadata', {})
                    protein = metadata.get('protein', 0) or 0
                    carbs = metadata.get('carbs', 0) or 0
                    
                    if protein > carbs:
                        filtered_results.append(result)
                        logger.info(f"✓ Kept: {metadata.get('name', 'Unknown')} - Protein: {protein}g, Carbs: {carbs}g")
                    else:
                        logger.info(f"✗ Filtered out: {metadata.get('name', 'Unknown')} - Protein: {protein}g, Carbs: {carbs}g (carbs >= protein)")
                
                if not filtered_results:
                    logger.warning("All results filtered out due to protein < carbs. Returning top results with best ratios.")
                    # Return top 3 with best protein/carb ratio
                    sorted_results = sorted(
                        results,
                        key=lambda x: (x.get('metadata', {}).get('protein', 0) or 0) / max((x.get('metadata', {}).get('carbs', 0) or 1), 1),
                        reverse=True
                    )
                    filtered_results = sorted_results[:3]
            
            elif is_protein_focused:
                # Sort by protein content
                filtered_results = sorted(
                    results,
                    key=lambda x: x.get('metadata', {}).get('protein', 0) or 0,
                    reverse=True
                )
            
            elif is_low_carb:
                # Filter for low carb items (< 30g carbs)
                filtered_results = [
                    r for r in results 
                    if (r.get('metadata', {}).get('carbs', 0) or 100) < 30
                ]
                if not filtered_results:
                    filtered_results = sorted(
                        results,
                        key=lambda x: x.get('metadata', {}).get('carbs', 100) or 100
                    )[:5]
        
        # Now use GPT to re-rank the filtered results
        if len(filtered_results) <= 1:
            return filtered_results
        
        # Prepare items for re-ranking
        items_text = ""
        for i, result in enumerate(filtered_results[:10]):  # Limit to 10 for efficiency
            metadata = result.get('metadata', {})
            items_text += f"""
{i+1}. {metadata.get('name', 'Unknown')}
   Restaurant: {metadata.get('restaurant', 'Unknown')}
   Calories: {metadata.get('calories', 'N/A')} | Protein: {metadata.get('protein', 'N/A')}g | Carbs: {metadata.get('carbs', 'N/A')}g | Fat: {metadata.get('fat', 'N/A')}g
   Price: ${metadata.get('price', 0):.2f}
"""

        rerank_prompt = f"""Given this user query: "{query}"

Rank these menu items from MOST to LEAST relevant. Consider:
1. How well the nutritional profile matches the query
2. Name/description relevance
3. Value for dietary goals

Items:
{items_text}

Return ONLY a JSON array of item numbers in order of relevance, e.g., [3, 1, 5, 2, 4]
"""

        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a food recommendation expert. Respond only with a JSON array."},
                    {"role": "user", "content": rerank_prompt}
                ],
                temperature=0.1,
                max_tokens=100
            )
            
            content = response.choices[0].message.content.strip()
            # Parse the ranking
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            ranking = json.loads(content)
            
            # Reorder results based on ranking
            reranked = []
            for idx in ranking:
                if 1 <= idx <= len(filtered_results):
                    reranked.append(filtered_results[idx - 1])
            
            # Add any items not in the ranking
            for result in filtered_results:
                if result not in reranked:
                    reranked.append(result)
            
            return reranked
            
        except Exception as e:
            logger.error(f"Error re-ranking results: {e}")
            return filtered_results
    
    def generate_match_explanation(self, query: str, item_metadata: Dict[str, Any]) -> str:
        """Generate a concise explanation of why an item matches the query.
        
        Args:
            query: User's search query
            item_metadata: Item's metadata including nutrition
            
        Returns:
            Short explanation string
        """
        name = item_metadata.get('name', 'Unknown')
        protein = item_metadata.get('protein', 0)
        carbs = item_metadata.get('carbs', 0)
        calories = item_metadata.get('calories', 0)
        fat = item_metadata.get('fat', 0)
        
        prompt = f"""Generate a 1-2 sentence explanation of why this menu item matches the search query.

Query: "{query}"
Item: {name}
Nutrition: {calories} cal, {protein}g protein, {carbs}g carbs, {fat}g fat

Be specific about nutritional benefits. Keep it under 50 words."""

        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a concise nutrition advisor. Give brief, specific explanations."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=100
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Error generating explanation: {e}")
            # Fallback explanation
            return f"{name} provides {protein}g protein and {carbs}g carbs at {calories} calories."
