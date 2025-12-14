"""SQLite database service for recipe storage."""

import sqlite3
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager


class DatabaseService:
    """SQLite database service for managing recipes."""
    
    def __init__(self, db_path: str):
        """Initialize database connection.
        
        Args:
            db_path: Path to SQLite database file
        """
        # Ensure directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        self.db_path = db_path
        self._init_db()
    
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
                    ingredients TEXT NOT NULL,
                    cooking_method TEXT,
                    cuisine_type TEXT,
                    cooking_time TEXT,
                    spice_level TEXT,
                    dietary_tags TEXT,
                    estimated_calories INTEGER,
                    estimated_protein REAL,
                    estimated_carbs REAL,
                    estimated_fat REAL,
                    description TEXT,
                    image_url TEXT,
                    restaurant_name TEXT,
                    delivery_time TEXT,
                    rating REAL,
                    price REAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
    
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
                    id, name, ingredients, cooking_method, cuisine_type,
                    cooking_time, spice_level, dietary_tags, estimated_calories,
                    estimated_protein, estimated_carbs, estimated_fat,
                    description, image_url, restaurant_name, delivery_time,
                    rating, price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                recipe_data.get('id'),
                recipe_data.get('name'),
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
                recipe_data.get('description'),
                recipe_data.get('image_url'),
                recipe_data.get('restaurant_name'),
                recipe_data.get('delivery_time'),
                recipe_data.get('rating'),
                recipe_data.get('price')
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
            data['ingredients'] = json.loads(data['ingredients'])
        if data.get('dietary_tags'):
            data['dietary_tags'] = json.loads(data['dietary_tags'])
        
        # Remove SQLite-specific fields
        data.pop('created_at', None)
        
        return data
    
    def close(self):
        """Close database connection (no-op for SQLite with context managers)."""
        pass
