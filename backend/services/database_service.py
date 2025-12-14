"""SQLite database service for menu item storage."""

import sqlite3
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """SQLite database service for managing menu items."""
    
    def __init__(self, db_path: str):
        """Initialize database connection.
        
        Args:
            db_path: Path to SQLite database file
        """
        # Ensure directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        self.db_path = db_path
        self._init_db()
        logger.info(f"Database initialized at: {db_path}")
    
    @contextmanager
    def get_connection(self):
        """Context manager for database connections."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()
    
    def _init_db(self):
        """Initialize database tables."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS recipes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    ingredients TEXT,
                    cooking_method TEXT,
                    cuisine_type TEXT,
                    cooking_time TEXT,
                    spice_level TEXT,
                    dietary_tags TEXT,
                    estimated_calories INTEGER,
                    estimated_protein REAL,
                    estimated_carbs REAL,
                    estimated_fat REAL,
                    image_url TEXT,
                    restaurant_name TEXT,
                    delivery_time TEXT,
                    rating REAL,
                    price REAL,
                    uber_uuid TEXT,
                    tags TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # Create index for faster searches
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_restaurant ON recipes(restaurant_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_cuisine ON recipes(cuisine_type)')
    
    def upsert_recipe(self, recipe_data: Dict[str, Any]) -> None:
        """Insert or update a recipe.
        
        Args:
            recipe_data: Recipe data dictionary
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Convert lists to JSON strings
            ingredients = json.dumps(recipe_data.get('ingredients', []))
            dietary_tags = json.dumps(recipe_data.get('dietary_tags', []))
            
            cursor.execute('''
                INSERT OR REPLACE INTO recipes (
                    id, name, description, ingredients, cooking_method, cuisine_type,
                    cooking_time, spice_level, dietary_tags, estimated_calories,
                    estimated_protein, estimated_carbs, estimated_fat,
                    image_url, restaurant_name, delivery_time,
                    rating, price, uber_uuid, tags
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                recipe_data.get('id'),
                recipe_data.get('name'),
                recipe_data.get('description'),
                ingredients,
                recipe_data.get('cooking_method'),
                recipe_data.get('cuisine_type'),
                recipe_data.get('cooking_time'),
                recipe_data.get('spice_level'),
                dietary_tags,
                recipe_data.get('estimated_calories'),
                recipe_data.get('estimated_protein'),
                recipe_data.get('estimated_carbs'),
                recipe_data.get('estimated_fat'),
                recipe_data.get('image_url'),
                recipe_data.get('restaurant_name'),
                recipe_data.get('delivery_time'),
                recipe_data.get('rating'),
                recipe_data.get('price'),
                recipe_data.get('uber_uuid'),
                recipe_data.get('tags')
            ))
    
    def get_recipe_by_id(self, recipe_id: str) -> Optional[Dict[str, Any]]:
        """Get a recipe by ID.
        
        Args:
            recipe_id: Recipe UUID
            
        Returns:
            Recipe data dictionary or None
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM recipes WHERE id = ?', (recipe_id,))
            row = cursor.fetchone()
            
            if row:
                return self._row_to_dict(row)
            return None
    
    def get_all_recipes(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all recipes.
        
        Args:
            limit: Maximum number of recipes to return
            
        Returns:
            List of recipe dictionaries
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM recipes LIMIT ?', (limit,))
            rows = cursor.fetchall()
            
            return [self._row_to_dict(row) for row in rows]
    
    def search_by_restaurant(self, restaurant_name: str) -> List[Dict[str, Any]]:
        """Search recipes by restaurant name.
        
        Args:
            restaurant_name: Restaurant name to search
            
        Returns:
            List of matching recipes
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM recipes WHERE restaurant_name LIKE ? LIMIT 50',
                (f'%{restaurant_name}%',)
            )
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def get_by_cuisine(self, cuisine_type: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recipes by cuisine type.
        
        Args:
            cuisine_type: Cuisine type to filter
            limit: Maximum results
            
        Returns:
            List of matching recipes
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM recipes WHERE cuisine_type LIKE ? LIMIT ?',
                (f'%{cuisine_type}%', limit)
            )
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert SQLite row to dictionary.
        
        Args:
            row: SQLite Row object
            
        Returns:
            Dictionary with parsed JSON fields
        """
        data = dict(row)
        
        # Parse JSON fields
        if data.get('ingredients'):
            try:
                data['ingredients'] = json.loads(data['ingredients'])
            except:
                data['ingredients'] = []
        else:
            data['ingredients'] = []
            
        if data.get('dietary_tags'):
            try:
                data['dietary_tags'] = json.loads(data['dietary_tags'])
            except:
                data['dietary_tags'] = []
        else:
            data['dietary_tags'] = []
        
        # Remove SQLite-specific fields
        data.pop('created_at', None)
        
        return data
    
    def get_count(self) -> int:
        """Get total recipe count."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM recipes')
            return cursor.fetchone()[0]
    
    def close(self):
        """Close database connection (no-op for SQLite with context managers)."""
        pass
