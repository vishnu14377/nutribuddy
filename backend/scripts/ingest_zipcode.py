"""Ingest real Uber Eats data for a zipcode into the fixture catalog.

Runs the live Apify connector (or converts an already-paid-for saved dataset
file with --from-dataset), estimates nutrition once via GPT with plausibility
checks, MERGES the result into backend/data/fixtures/ubereats.json (fixtures
stay the reproducible source of truth), then per-source reseeds.

Usage (from backend/):
    ./venv/bin/python scripts/ingest_zipcode.py --zipcode 18042 --max-stores 10
    ./venv/bin/python scripts/ingest_zipcode.py --from-dataset /path/pilot.json
Add --no-seed to only update the fixture file.

COST: live runs bill Apify (~$0.02/store row observed). --from-dataset is free.
"""

import argparse
import json
import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from connectors.apify_connector import ApifyUberEatsConnector
from services.openai_service import OpenAIService
from utils.tags import sanitize_dietary_tags
from scripts.build_fixtures import _estimate_with_plausibility_check

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger(__name__)

FIXTURE_PATH = Path(__file__).resolve().parent.parent / 'data' / 'fixtures' / 'ubereats.json'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--zipcode', help='US zipcode to scrape live via Apify')
    parser.add_argument('--query', default='', help='Optional search keyword')
    parser.add_argument('--max-stores', type=int, default=10)
    parser.add_argument('--items-per-store', type=int, default=12)
    parser.add_argument('--from-dataset', help='Path to a saved Apify dataset JSON (no live run)')
    parser.add_argument('--no-seed', action='store_true', help='Update the fixture only; skip reseeding')
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir / '.env')

    if args.from_dataset:
        rows = json.load(open(args.from_dataset))
        recipes = ApifyUberEatsConnector.normalize_rows(rows, items_per_store=args.items_per_store)
    elif args.zipcode:
        connector = ApifyUberEatsConnector(token=os.environ.get('APIFY_TOKEN'))
        recipes = connector.fetch_items(
            args.zipcode, search_query=args.query,
            max_stores=args.max_stores, items_per_store=args.items_per_store)
    else:
        raise SystemExit('Provide --zipcode (live) or --from-dataset (saved file)')

    if not recipes:
        raise SystemExit('No orderable items found')
    logger.info(f"{len(recipes)} normalized items to enrich")

    openai_service = OpenAIService(api_key=os.environ['OPENAI_API_KEY'])
    enriched, dropped = [], 0
    for i, recipe in enumerate(recipes):
        item = recipe.model_dump()
        nutrition = _estimate_with_plausibility_check(openai_service, item)
        if nutrition is None:
            dropped += 1
            continue
        recipe.estimated_calories = nutrition['calories']
        recipe.estimated_protein = float(nutrition['protein'])
        recipe.estimated_carbs = float(nutrition['carbs'])
        recipe.estimated_fat = float(nutrition['fat'])
        recipe.dietary_tags = sanitize_dietary_tags(
            nutrition.get('dietary_tags', []),
            carbs=recipe.estimated_carbs, protein=recipe.estimated_protein,
            name=recipe.name, description=recipe.description or '')
        enriched.append(recipe.model_dump())
        if (i + 1) % 10 == 0:
            logger.info(f"Nutrition estimated for {i + 1}/{len(recipes)} ({dropped} dropped)")

    # Merge into the fixture: new (restaurant, dish) pairs are added; existing
    # pairs are replaced with the fresher scrape.
    existing = json.load(open(FIXTURE_PATH)) if FIXTURE_PATH.exists() else []
    def key(it):
        return ((it.get('restaurant_name') or '').lower(), (it.get('name') or '').lower())
    fresh_keys = {key(it) for it in enriched}
    merged = [it for it in existing if key(it) not in fresh_keys] + enriched
    with open(FIXTURE_PATH, 'w') as f:
        json.dump(merged, f, indent=2)
    logger.info(f"Fixture now has {len(merged)} items ({len(enriched)} new/updated, {dropped} dropped)")

    if not args.no_seed:
        from scripts.seed_fixtures import main as seed_main
        sys.argv = ['seed_fixtures.py', '--platforms', 'ubereats']
        seed_main()


if __name__ == '__main__':
    main()
