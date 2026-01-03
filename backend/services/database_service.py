"""SQLite database service for menu items."""

import sqlite3
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """SQLite database service."""
    
    def __init__(self, db_path: str = None):
        db_path = db_path or os.environ.get('DB_PATH', 'data/nutribuddy.db')
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self._init_db()
        logger.info(f"SQLite connected: {db_path}")
    
    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    
    def _init_db(self):
        with self.get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS recipes (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    description TEXT,
                    ingredients TEXT,
                    cuisine_type TEXT,
                    spice_level TEXT,
                    dietary_tags TEXT,
                    estimated_calories INTEGER,
                    estimated_protein REAL,
                    estimated_carbs REAL,
                    estimated_fat REAL,
                    image_url TEXT,
                    restaurant_name TEXT,
                    rating REAL,
                    price REAL
                )
            ''')
    
    def upsert_recipe(self, data: Dict[str, Any]) -> None:
        with self.get_connection() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO recipes 
                (id, name, description, ingredients, cuisine_type, spice_level, dietary_tags,
                 estimated_calories, estimated_protein, estimated_carbs, estimated_fat,
                 image_url, restaurant_name, rating, price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('id'), data.get('name'), data.get('description'),
                json.dumps(data.get('ingredients', [])), data.get('cuisine_type'),
                data.get('spice_level'), json.dumps(data.get('dietary_tags', [])),
                data.get('estimated_calories'), data.get('estimated_protein'),
                data.get('estimated_carbs'), data.get('estimated_fat'),
                data.get('image_url'), data.get('restaurant_name'),
                data.get('rating'), data.get('price')
            ))
    
    def get_recipe_by_id(self, recipe_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            row = conn.execute('SELECT * FROM recipes WHERE id = ?', (recipe_id,)).fetchone()
            return self._row_to_dict(row) if row else None
    
    def get_recipes_by_ids(self, recipe_ids: List[str]) -> List[Dict[str, Any]]:
        if not recipe_ids:
            return []
        with self.get_connection() as conn:
            placeholders = ','.join('?' * len(recipe_ids))
            rows = conn.execute(f'SELECT * FROM recipes WHERE id IN ({placeholders})', recipe_ids).fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def get_all_recipes(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute('SELECT * FROM recipes LIMIT ?', (limit,)).fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def _row_to_dict(self, row) -> Dict[str, Any]:
        data = dict(row)
        for field in ['ingredients', 'dietary_tags']:
            if data.get(field):
                try:
                    data[field] = json.loads(data[field])
                except:
                    data[field] = []
            else:
                data[field] = []
        return data
    
    def get_count(self) -> int:
        with self.get_connection() as conn:
            return conn.execute('SELECT COUNT(*) FROM recipes').fetchone()[0]
    
    def clear_all(self) -> None:
        with self.get_connection() as conn:
            conn.execute('DELETE FROM recipes')
    
    def close(self):
        pass
