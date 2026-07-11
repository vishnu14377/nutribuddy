"""SQLite database service for menu items."""

import sqlite3
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

# Every persisted Recipe field, in canonical column order.
COLUMNS = [
    'id', 'name', 'description', 'ingredients', 'cooking_method', 'cuisine_type',
    'cooking_time', 'spice_level', 'dietary_tags',
    'estimated_calories', 'estimated_protein', 'estimated_carbs', 'estimated_fat',
    'image_url', 'restaurant_name', 'delivery_time', 'rating',
    'price', 'currency', 'source_platform', 'order_url', 'uber_uuid', 'tags',
]

JSON_COLUMNS = ('ingredients', 'dietary_tags')


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
                    currency TEXT,
                    source_platform TEXT DEFAULT 'biterush',
                    order_url TEXT,
                    uber_uuid TEXT,
                    tags TEXT
                )
            ''')
            self._migrate(conn)

    def _migrate(self, conn):
        """Idempotent migrations keyed on PRAGMA user_version.

        Pre-existing databases created before the multi-platform schema get
        any missing columns added in place; data is preserved.
        """
        version = conn.execute('PRAGMA user_version').fetchone()[0]
        if version >= SCHEMA_VERSION:
            return

        existing = {row[1] for row in conn.execute('PRAGMA table_info(recipes)').fetchall()}
        defaults = {'source_platform': "DEFAULT 'biterush'"}
        for col in COLUMNS:
            if col not in existing:
                col_type = 'INTEGER' if col == 'estimated_calories' else \
                           'REAL' if col in ('estimated_protein', 'estimated_carbs', 'estimated_fat', 'rating', 'price') else 'TEXT'
                conn.execute(f'ALTER TABLE recipes ADD COLUMN {col} {col_type} {defaults.get(col, "")}')
                logger.info(f"Migration: added column {col}")

        conn.execute('CREATE INDEX IF NOT EXISTS idx_source_platform ON recipes(source_platform)')
        conn.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')

    def upsert_recipe(self, data: Dict[str, Any]) -> None:
        values = []
        for col in COLUMNS:
            val = data.get(col)
            if col in JSON_COLUMNS:
                val = json.dumps(val or [])
            values.append(val)
        placeholders = ','.join('?' * len(COLUMNS))
        with self.get_connection() as conn:
            conn.execute(
                f'INSERT OR REPLACE INTO recipes ({",".join(COLUMNS)}) VALUES ({placeholders})',
                values
            )

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

    def get_ids_by_source(self, source_platform: str) -> List[str]:
        with self.get_connection() as conn:
            rows = conn.execute(
                'SELECT id FROM recipes WHERE source_platform = ?', (source_platform,)
            ).fetchall()
            return [row['id'] for row in rows]

    def clear_source(self, source_platform: str) -> int:
        with self.get_connection() as conn:
            cur = conn.execute('DELETE FROM recipes WHERE source_platform = ?', (source_platform,))
            return cur.rowcount

    def get_platform_counts(self) -> Dict[str, int]:
        with self.get_connection() as conn:
            rows = conn.execute(
                "SELECT COALESCE(source_platform, 'unknown') AS p, COUNT(*) AS n FROM recipes GROUP BY p"
            ).fetchall()
            return {row['p']: row['n'] for row in rows}

    def _row_to_dict(self, row) -> Dict[str, Any]:
        data = dict(row)
        for field in JSON_COLUMNS:
            if data.get(field):
                try:
                    data[field] = json.loads(data[field])
                except (json.JSONDecodeError, TypeError):
                    data[field] = []
            else:
                data[field] = []
        if not data.get('source_platform'):
            data['source_platform'] = 'biterush'
        return data

    def get_count(self) -> int:
        with self.get_connection() as conn:
            return conn.execute('SELECT COUNT(*) FROM recipes').fetchone()[0]

    def clear_all(self) -> None:
        with self.get_connection() as conn:
            conn.execute('DELETE FROM recipes')

    def close(self):
        pass
