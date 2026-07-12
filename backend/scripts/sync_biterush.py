"""Sync the BiteRush app's live catalog into Nutribuddy.

BiteRush (biterush/ in this monorepo: Express + MongoDB on :4000, customer
frontend on :5173) is a first-party orderable platform. This pulls its food
list, normalizes to the connector contract (USD major units, per-item
/food/<id> deep links, image URLs), estimates nutrition once via GPT, and
per-source reseeds — so Nutribuddy search results hand off straight into the
BiteRush ordering flow.

Usage (BiteRush backend must be running):
    ./venv/bin/python scripts/sync_biterush.py [--no-seed]
Env: BITERUSH_API_URL (default http://localhost:4000),
     BITERUSH_FRONTEND_URL (default http://localhost:5173)
"""

import argparse
import json
import os
import sys
import logging
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests
from dotenv import load_dotenv

from models.recipe import Recipe
from services.openai_service import OpenAIService
from utils.tags import sanitize_dietary_tags
from scripts.build_fixtures import _estimate_with_plausibility_check

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger(__name__)

FIXTURE = Path(__file__).resolve().parent.parent / 'data' / 'fixtures' / 'biterush.json'


def fetch_foods(api_url: str) -> list:
    resp = requests.get(f'{api_url}/api/food/list', timeout=15)
    resp.raise_for_status()
    body = resp.json()
    foods = body.get('data') if isinstance(body, dict) else body
    if not isinstance(foods, list):
        raise SystemExit(f'Unexpected /api/food/list response shape: {type(foods)}')
    return foods


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-seed', action='store_true')
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir / '.env')
    api_url = os.environ.get('BITERUSH_API_URL', 'http://localhost:4000').rstrip('/')
    front_url = os.environ.get('BITERUSH_FRONTEND_URL', 'http://localhost:5173').rstrip('/')

    if 'localhost' in front_url or '127.0.0.1' in front_url:
        logger.warning('BITERUSH_FRONTEND_URL is a localhost URL — order links will only '
                       'work in local dev. Set the public BiteRush URL before production sync.')
    foods = fetch_foods(api_url)
    logger.info(f"BiteRush returned {len(foods)} foods")

    openai_service = OpenAIService(api_key=os.environ['OPENAI_API_KEY'])
    items, dropped = [], 0
    for food in foods:
        if food.get('isAvailable') is False:
            continue
        food_id = str(food.get('_id') or '')
        raw = {
            'id': str(uuid.uuid4()),
            'name': (food.get('name') or '')[:200],
            'description': (food.get('description') or '')[:500],
            'restaurant_name': 'BiteRush Kitchen',
            'cuisine_type': (food.get('category') or None),
            'image_url': (food.get('image') if str(food.get('image', '')).startswith('http')
                          else f"{api_url}/images/{food.get('image')}") if food.get('image') else '',
            # Partner DB stores legacy ambiguous-scale prices (149-379);
            # convert to demo USD (same /20 rule as the fixtures) until the
            # partner re-prices. Real single-dish USD prices pass through.
            'price': (lambda v: round(max(4.99, v / 20), 2) if v > 100 else round(v, 2))(
                float(food.get('price') or 0)),
            'currency': 'USD',
            'source_platform': 'biterush',
            'order_url': f"{front_url}/food/{food_id}" if food_id else None,
            'rating': food.get('rating') or 0,
        }
        if not raw['name'] or raw['price'] <= 0:
            continue
        nutrition = _estimate_with_plausibility_check(openai_service, raw)
        if nutrition is None:
            dropped += 1
            continue
        recipe = Recipe(**{
            **raw,
            'estimated_calories': nutrition['calories'],
            'estimated_protein': float(nutrition['protein']),
            'estimated_carbs': float(nutrition['carbs']),
            'estimated_fat': float(nutrition['fat']),
            'dietary_tags': sanitize_dietary_tags(
                nutrition.get('dietary_tags', []), carbs=nutrition['carbs'],
                protein=nutrition['protein'], name=raw['name'],
                description=raw['description']),
        })
        items.append(recipe.model_dump())

    if not items:
        raise SystemExit('No available foods to sync')
    with open(FIXTURE, 'w') as f:
        json.dump(items, f, indent=2)
    logger.info(f"biterush fixture replaced: {len(items)} items ({dropped} dropped)")

    if not args.no_seed:
        from scripts.seed_fixtures import main as seed_main
        sys.argv = ['seed_fixtures.py', '--platforms', 'biterush']
        seed_main()


if __name__ == '__main__':
    main()
