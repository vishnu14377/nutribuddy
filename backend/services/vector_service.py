"""Vector embedding and search service with LLM enhancement."""

import google.generativeai as genai
from pinecone import Pinecone, ServerlessSpec
from typing import List, Dict, Any, Optional
import os
import logging
from models.recipe import Recipe

logger = logging.getLogger(__name__)


class VectorService:
    """Service for vector embeddings and similarity search."""
    
    def __init__(self, pinecone_api_key: str, google_api_key: str):
        """Initialize vector service with API keys.
        
        Args:
            pinecone_api_key: Pinecone API key
            google_api_key: Google Gemini API key
        """
        # Configure Google Gemini
        genai.configure(api_key=google_api_key)
        self.google_api_key = google_api_key
        
        # Initialize Pinecone
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = "ubereats-menu"
        
        # Create index if it doesn't exist
        existing_indexes = [idx.name for idx in self.pc.list_indexes()]
        if self.index_name not in existing_indexes:
            logger.info(f"Creating Pinecone index: {self.index_name}")
            self.pc.create_index(
                name=self.index_name,
                dimension=768,
                metric='cosine',
                spec=ServerlessSpec(
                    cloud='aws',
                    region='us-east-1'
                )
            )
        
        self.index = self.pc.Index(self.index_name)
        logger.info(f"Connected to Pinecone index: {self.index_name}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector using Gemini.
        
        Args:
            text: Text to embed
            
        Returns:
            List of embedding values
        """
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    
    def create_searchable_text(self, recipe: Recipe) -> str:
        """Create searchable text from recipe/menu item.
        
        Args:
            recipe: Recipe model
            
        Returns:
            Formatted searchable text optimized for semantic search
        """
        # Build rich searchable text
        dietary_info = ', '.join(recipe.dietary_tags) if recipe.dietary_tags else 'No special diet'
        
        text = f"""
        Menu Item: {recipe.name}
        Restaurant: {recipe.restaurant_name or 'Various'}
        Cuisine: {recipe.cuisine_type}
        Description: {recipe.description or ''}
        
        Nutritional Information:
        - Calories: {recipe.estimated_calories or 'Unknown'} kcal
        - Protein: {recipe.estimated_protein or 'Unknown'}g
        - Carbohydrates: {recipe.estimated_carbs or 'Unknown'}g
        - Fat: {recipe.estimated_fat or 'Unknown'}g
        
        Dietary Tags: {dietary_info}
        Spice Level: {recipe.spice_level or 'Mild'}
        Price: ${recipe.price or 0:.2f}
        Delivery Time: {recipe.delivery_time or '20-35 min'}
        
        Keywords: {recipe.name}, {recipe.cuisine_type}, {recipe.restaurant_name or ''}, 
        {recipe.spice_level or ''}, {dietary_info}
        """
        
        return text.strip()
    
    def store_recipe(self, recipe: Recipe) -> None:
        """Store recipe in vector database.
        
        Args:
            recipe: Recipe to store
        """
        searchable_text = self.create_searchable_text(recipe)
        embedding = self.generate_embedding(searchable_text)
        
        # Prepare metadata (Pinecone has size limits)
        metadata = {
            'name': recipe.name[:200] if recipe.name else '',
            'restaurant': (recipe.restaurant_name or '')[:100],
            'cuisine_type': (recipe.cuisine_type or '')[:50],
            'spice_level': (recipe.spice_level or 'Mild')[:20],
            'dietary_tags': ','.join(recipe.dietary_tags or [])[:100],
            'calories': recipe.estimated_calories or 0,
            'protein': recipe.estimated_protein or 0,
            'carbs': recipe.estimated_carbs or 0,
            'fat': recipe.estimated_fat or 0,
            'price': recipe.price or 0
        }
        
        self.index.upsert(
            vectors=[{
                'id': recipe.id,
                'values': embedding,
                'metadata': metadata
            }]
        )
    
    def store_recipes_batch(self, recipes: List[Recipe], batch_size: int = 100) -> int:
        """Store multiple recipes in batches.
        
        Args:
            recipes: List of recipes to store
            batch_size: Number of recipes per batch
            
        Returns:
            Number of recipes stored
        """
        stored = 0
        vectors = []
        
        for recipe in recipes:
            try:
                searchable_text = self.create_searchable_text(recipe)
                embedding = self.generate_embedding(searchable_text)
                
                metadata = {
                    'name': recipe.name[:200] if recipe.name else '',
                    'restaurant': (recipe.restaurant_name or '')[:100],
                    'cuisine_type': (recipe.cuisine_type or '')[:50],
                    'spice_level': (recipe.spice_level or 'Mild')[:20],
                    'dietary_tags': ','.join(recipe.dietary_tags or [])[:100],
                    'calories': recipe.estimated_calories or 0,
                    'protein': recipe.estimated_protein or 0,
                    'carbs': recipe.estimated_carbs or 0,
                    'fat': recipe.estimated_fat or 0,
                    'price': recipe.price or 0
                }
                
                vectors.append({
                    'id': recipe.id,
                    'values': embedding,
                    'metadata': metadata
                })
                
                if len(vectors) >= batch_size:
                    self.index.upsert(vectors=vectors)
                    stored += len(vectors)
                    logger.info(f"Stored {stored} vectors...")
                    vectors = []
                    
            except Exception as e:
                logger.error(f"Error processing {recipe.name}: {e}")
                continue
        
        # Store remaining vectors
        if vectors:
            self.index.upsert(vectors=vectors)
            stored += len(vectors)
        
        return stored
    
    def search(self, query: str, top_k: int = 10, filters: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Search for recipes using natural language.
        
        Args:
            query: Search query
            top_k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of search results with scores
        """
        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        
        # Build filter if provided
        filter_dict = None
        if filters:
            filter_dict = {}
            if 'max_calories' in filters:
                filter_dict['calories'] = {'$lte': filters['max_calories']}
            if 'cuisine_type' in filters:
                filter_dict['cuisine_type'] = {'$eq': filters['cuisine_type']}
            if 'spice_level' in filters:
                filter_dict['spice_level'] = {'$eq': filters['spice_level']}
        
        # Query Pinecone
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict if filter_dict else None
        )
        
        return [{
            'id': match['id'],
            'score': match['score'],
            'metadata': match.get('metadata', {})
        } for match in results['matches']]
    
    def get_index_stats(self) -> Dict[str, Any]:
        """Get Pinecone index statistics.
        
        Returns:
            Index statistics dictionary
        """
        stats = self.index.describe_index_stats()
        return {
            'total_vectors': stats.total_vector_count,
            'dimension': stats.dimension,
            'namespaces': dict(stats.namespaces) if stats.namespaces else {}
        }
    
    def clear_index(self) -> None:
        """Clear all vectors from the index."""
        self.index.delete(delete_all=True)
        logger.info("Cleared all vectors from index")
