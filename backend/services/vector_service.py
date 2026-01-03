"""Vector embedding and search service using OpenAI."""

from pinecone import Pinecone, ServerlessSpec
from typing import List, Dict, Any, Optional
import os
import logging
import time
from models.recipe import Recipe
from services.openai_service import OpenAIService

logger = logging.getLogger(__name__)


class VectorService:
    """Service for vector embeddings and similarity search using OpenAI."""
    
    def __init__(self, pinecone_api_key: str, openai_api_key: str):
        """Initialize vector service with API keys.
        
        Args:
            pinecone_api_key: Pinecone API key
            openai_api_key: OpenAI API key
        """
        # Initialize OpenAI service
        self.openai_service = OpenAIService(api_key=openai_api_key)
        
        # Initialize Pinecone
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = os.environ.get('PINECONE_INDEX_NAME', 'nutribuddy-index')
        self.embedding_dimensions = 1536  # OpenAI text-embedding-3-large reduced dimensions
        
        # Create or verify index
        self._ensure_index()
        
        self.index = self.pc.Index(self.index_name)
        logger.info(f"Connected to Pinecone index: {self.index_name}")
    
    def _ensure_index(self):
        """Ensure Pinecone index exists with correct dimensions."""
        existing_indexes = [idx.name for idx in self.pc.list_indexes()]
        
        if self.index_name in existing_indexes:
            # Verify dimensions
            index = self.pc.Index(self.index_name)
            stats = index.describe_index_stats()
            logger.info(f"Index {self.index_name} exists with stats: {stats}")
        else:
            # Create the index if it doesn't exist
            logger.info(f"Creating Pinecone index: {self.index_name}")
            self.pc.create_index(
                name=self.index_name,
                dimension=self.embedding_dimensions,
                metric='cosine',
                spec=ServerlessSpec(
                    cloud='aws',
                    region='us-east-1'
                )
            )
            logger.info(f"Successfully created Pinecone index: {self.index_name}")
            # Wait for index to be ready
            time.sleep(5)
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector using OpenAI.
        
        Args:
            text: Text to embed
            
        Returns:
            List of embedding values (1536 dimensions)
        """
        return self.openai_service.generate_embedding(text)
    
    def create_searchable_text(self, recipe: Recipe) -> str:
        """Create searchable text from recipe/menu item.
        
        Args:
            recipe: Recipe model
            
        Returns:
            Formatted searchable text optimized for semantic search
        """
        # Build rich searchable text
        dietary_info = ', '.join(recipe.dietary_tags) if recipe.dietary_tags else 'No special diet'
        
        # Create detailed text for better semantic matching
        text = f"""
Menu Item: {recipe.name}
Restaurant: {recipe.restaurant_name or 'Various'}
Cuisine: {recipe.cuisine_type or 'General'}
Description: {recipe.description or ''}

Nutritional Profile:
- Calories: {recipe.estimated_calories or 'Unknown'} kcal
- Protein: {recipe.estimated_protein or 0}g ({"high protein" if (recipe.estimated_protein or 0) > 25 else "moderate protein" if (recipe.estimated_protein or 0) > 15 else "low protein"})
- Carbohydrates: {recipe.estimated_carbs or 0}g ({"low carb" if (recipe.estimated_carbs or 0) < 20 else "moderate carbs" if (recipe.estimated_carbs or 0) < 50 else "high carbs"})
- Fat: {recipe.estimated_fat or 0}g

Dietary Information: {dietary_info}
Spice Level: {recipe.spice_level or 'Mild'}
Price: ${recipe.price or 0:.2f}

Keywords: {recipe.name}, {recipe.cuisine_type or ''}, {recipe.restaurant_name or ''}, 
{dietary_info}, {"high protein" if (recipe.estimated_protein or 0) > 25 else ""}, 
{"low carb keto friendly" if (recipe.estimated_carbs or 0) < 20 else ""}
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
    
    def store_recipes_batch(self, recipes: List[Recipe], batch_size: int = 50) -> int:
        """Store multiple recipes in batches.
        
        Args:
            recipes: List of recipes to store
            batch_size: Number of recipes per batch
            
        Returns:
            Number of recipes stored
        """
        stored = 0
        vectors = []
        
        for i, recipe in enumerate(recipes):
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
                    logger.info(f"Stored {stored}/{len(recipes)} vectors...")
                    vectors = []
                    # Small delay to avoid rate limits
                    time.sleep(0.5)
                    
            except Exception as e:
                logger.error(f"Error processing {recipe.name}: {e}")
                continue
        
        # Store remaining vectors
        if vectors:
            self.index.upsert(vectors=vectors)
            stored += len(vectors)
        
        logger.info(f"Successfully stored {stored} vectors in Pinecone")
        return stored
    
    def search(self, query: str, top_k: int = 20, filters: Optional[Dict] = None) -> List[Dict[str, Any]]:
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
            if 'min_protein' in filters:
                filter_dict['protein'] = {'$gte': filters['min_protein']}
            if 'max_carbs' in filters:
                filter_dict['carbs'] = {'$lte': filters['max_carbs']}
        
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
    
    def clear_index(self) -> None:
        """Clear all vectors from the index."""
        try:
            self.index.delete(delete_all=True)
            logger.info(f"Cleared all vectors from index: {self.index_name}")
        except Exception as e:
            logger.error(f"Error clearing index: {e}")
            raise
    
    def get_index_stats(self) -> Dict[str, Any]:
        """Get Pinecone index statistics.
        
        Returns:
            Index statistics dictionary
        """
        stats = self.index.describe_index_stats()
        # Convert Pinecone response to serializable dict
        return {
            'index_name': self.index_name,
            'dimension': self.embedding_dimensions,
            'total_vectors': int(stats.total_vector_count) if hasattr(stats, 'total_vector_count') else stats.get('total_vector_count', 0),
            'index_fullness': float(stats.index_fullness) if hasattr(stats, 'index_fullness') else 0.0
        }
