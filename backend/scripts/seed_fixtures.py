"""Seed the database + vector store from checked-in fixture datasets.

Deterministic, cheap (only embedding calls, one per batch of 50), and
per-source: each fixture platform replaces ONLY its own previous data, so
re-running is idempotent and platforms can be reseeded independently.

Usage (from backend/):
    ./venv/bin/python scripts/seed_fixtures.py [--platforms ubereats doordash biterush]
"""

import argparse
import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from connectors.fixture_connector import FixtureConnector, FIXTURES_DIR
from services.database_service import DatabaseService
from services.vector_service import VectorService

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platforms', nargs='*', default=None,
                        help='Platforms to seed (default: every fixture present)')
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir / '.env')

    platforms = args.platforms or sorted(p.stem for p in FIXTURES_DIR.glob('*.json'))
    if not platforms:
        raise SystemExit(f'No fixtures found in {FIXTURES_DIR}')

    db_service = DatabaseService(str(backend_dir / 'data' / 'nutribuddy.db'))
    vector_service = VectorService(
        pinecone_api_key=os.environ['PINECONE_API_KEY'],
        openai_api_key=os.environ['OPENAI_API_KEY'],
    )

    for platform in platforms:
        items = FixtureConnector(platform).fetch_items(limit=5000)
        # Per-source replace: SQLite is the ID source of truth; delete vectors
        # by those IDs first, then the rows.
        old_ids = db_service.get_ids_by_source(platform)
        if old_ids:
            vector_service.delete_by_ids(old_ids)
            db_service.clear_source(platform)
            logger.info(f"[{platform}] removed {len(old_ids)} existing items")
        for recipe in items:
            db_service.upsert_recipe(recipe.model_dump())
        stored = vector_service.store_recipes_batch(items, batch_size=50)
        logger.info(f"[{platform}] seeded {len(items)} items, {stored} vectors")

    logger.info(f"Done. DB count: {db_service.get_count()}, platforms: {db_service.get_platform_counts()}")


if __name__ == '__main__':
    main()
