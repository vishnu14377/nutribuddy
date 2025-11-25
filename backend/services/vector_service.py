"""Vector embedding and search service."""

import google.generativeai as genai
from pinecone import Pinecone, ServerlessSpec
from typing import List, Dict, Any
import os
from models.recipe import Recipe


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
        
        # Initialize Pinecone
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = "nima-recipes"
        
        # Create index if it doesn't exist
        if self.index_name not in self.pc.list_indexes().names():
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
        """Create searchable text from recipe.
        
        Args:
            recipe: Recipe model
            
        Returns:
            Formatted searchable text
        """
        return f"""
        Recipe: {recipe.name}
        Cuisine: {recipe.cuisine_type}
        Cooking Method: {recipe.cooking_method}
        Ingredients: {', '.join(recipe.ingredients)}
        Spice Level: {recipe.spice_level}
        Dietary Tags: {', '.join(recipe.dietary_tags)}
        Nutrition: {recipe.estimated_calories} calories, {recipe.estimated_protein}g protein, {recipe.estimated_carbs}g carbs, {recipe.estimated_fat}g fat
        Description: {recipe.description}
        """
    
    def store_recipe(self, recipe: Recipe) -> None:
        """Store recipe in vector database.
        
        Args:
            recipe: Recipe to store
        """
        searchable_text = self.create_searchable_text(recipe)
        embedding = self.generate_embedding(searchable_text)
        
        self.index.upsert(
            vectors=[{
                'id': recipe.id,
                'values': embedding,
                'metadata': {
                    'name': recipe.name,
                    'cuisine_type': recipe.cuisine_type,
                    'spice_level': recipe.spice_level or 'Mild',
                    'dietary_tags': ','.join(recipe.dietary_tags),
                    'calories': recipe.estimated_calories
                }
            }]
        )
    
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """Search for recipes using natural language.
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of search results with scores
        """
        query_embedding = self.generate_embedding(query)
        
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        return results['matches']
