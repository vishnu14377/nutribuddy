"""MongoDB database service for menu item storage."""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import json
import os
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """MongoDB database service for managing menu items."""
    
    def __init__(self, mongo_url: str = None, db_name: str = "nutribuddy"):
        """Initialize MongoDB connection.
        
        Args:
            mongo_url: MongoDB connection URL
            db_name: Database name
        """
        self.mongo_url = mongo_url or os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        self.db_name = db_name
        
        # Sync client for regular operations
        self.client = MongoClient(self.mongo_url)
        self.db = self.client[self.db_name]
        self.recipes = self.db.recipes
        
        # Create indexes
        self.recipes.create_index("id", unique=True)
        self.recipes.create_index("restaurant_name")
        self.recipes.create_index("cuisine_type")
        
        logger.info(f"MongoDB connected: {self.db_name}")
    
    def upsert_recipe(self, recipe_data: Dict[str, Any]) -> None:
        """Insert or update a recipe.
        
        Args:
            recipe_data: Recipe data dictionary
        """
        recipe_id = recipe_data.get('id')
        if not recipe_id:
            return
        
        self.recipes.update_one(
            {"id": recipe_id},
            {"$set": recipe_data},
            upsert=True
        )
    
    def get_recipe_by_id(self, recipe_id: str) -> Optional[Dict[str, Any]]:
        """Get a recipe by ID.
        
        Args:
            recipe_id: Recipe UUID
            
        Returns:
            Recipe data dictionary or None
        """
        doc = self.recipes.find_one({"id": recipe_id}, {"_id": 0})
        return doc
    
    def get_recipes_by_ids(self, recipe_ids: List[str]) -> List[Dict[str, Any]]:
        """Get multiple recipes by IDs (batch operation).
        
        Args:
            recipe_ids: List of recipe UUIDs
            
        Returns:
            List of recipe dictionaries
        """
        docs = list(self.recipes.find(
            {"id": {"$in": recipe_ids}},
            {"_id": 0}
        ))
        return docs
    
    def get_all_recipes(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all recipes.
        
        Args:
            limit: Maximum number of recipes to return
            
        Returns:
            List of recipe dictionaries
        """
        docs = list(self.recipes.find({}, {"_id": 0}).limit(limit))
        return docs
    
    def search_by_restaurant(self, restaurant_name: str) -> List[Dict[str, Any]]:
        """Search recipes by restaurant name.
        
        Args:
            restaurant_name: Restaurant name to search
            
        Returns:
            List of matching recipes
        """
        docs = list(self.recipes.find(
            {"restaurant_name": {"$regex": restaurant_name, "$options": "i"}},
            {"_id": 0}
        ).limit(50))
        return docs
    
    def get_by_cuisine(self, cuisine_type: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recipes by cuisine type.
        
        Args:
            cuisine_type: Cuisine type to filter
            limit: Maximum results
            
        Returns:
            List of matching recipes
        """
        docs = list(self.recipes.find(
            {"cuisine_type": {"$regex": cuisine_type, "$options": "i"}},
            {"_id": 0}
        ).limit(limit))
        return docs
    
    def get_count(self) -> int:
        """Get total recipe count."""
        return self.recipes.count_documents({})
    
    def clear_all(self) -> None:
        """Delete all recipes."""
        self.recipes.delete_many({})
        logger.info("All recipes deleted from MongoDB")
    
    def close(self):
        """Close MongoDB connection."""
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed")
