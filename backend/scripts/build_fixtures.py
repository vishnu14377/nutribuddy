"""One-time fixture builder: Apify Uber Eats Excel export -> normalized fixture JSON.

Parses the real scraped dataset, filters to orderable items with real prices,
balances across restaurants, estimates nutrition once via GPT, and writes
backend/data/fixtures/ubereats.json so seeding is deterministic and free.

Usage (from backend/):
    ./venv/bin/python scripts/build_fixtures.py [--limit 120] [--xlsx data/ubereats_new.xlsx]
"""

import argparse
import json
import os
import sys
import time
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from services.data_ingestion_service import DataIngestionService
from services.openai_service import OpenAIService
from models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger(__name__)

MAX_ITEMS_PER_RESTAURANT = 3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=120)
    parser.add_argument('--xlsx', default='data/ubereats_new.xlsx')
    parser.add_argument('--out', default='data/fixtures/ubereats.json')
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise SystemExit('OPENAI_API_KEY required for nutrition estimation')

    raw_items = DataIngestionService.extract_menu_items_from_excel(args.xlsx, limit=args.limit * 6)
    logger.info(f"Extracted {len(raw_items)} raw items")

    # Filter junk, dedupe, and balance across restaurants for variety
    seen = set()
    per_restaurant = {}
    selected = []
    for item in raw_items:
        if item['price'] <= 0 or not item['name'].strip():
            continue
        key = (item['restaurant_name'], item['name'].lower())
        if key in seen:
            continue
        if per_restaurant.get(item['restaurant_name'], 0) >= MAX_ITEMS_PER_RESTAURANT:
            continue
        seen.add(key)
        per_restaurant[item['restaurant_name']] = per_restaurant.get(item['restaurant_name'], 0) + 1
        selected.append(item)
        if len(selected) >= args.limit:
            break
    logger.info(f"Selected {len(selected)} items across {len(per_restaurant)} restaurants")

    openai_service = OpenAIService(api_key=api_key)
    enriched = []
    for i, item in enumerate(selected):
        nutrition = openai_service.estimate_nutrition(item['name'], item.get('description', ''))
        recipe = Recipe(**{
            **item,
            'estimated_calories': nutrition['calories'],
            'estimated_protein': nutrition['protein'],
            'estimated_carbs': nutrition['carbs'],
            'estimated_fat': nutrition['fat'],
            'dietary_tags': nutrition.get('dietary_tags', []),
        })
        enriched.append(recipe.model_dump())
        if (i + 1) % 10 == 0:
            logger.info(f"Estimated nutrition for {i + 1}/{len(selected)} items")
            time.sleep(0.5)

    out_path = Path(__file__).resolve().parent.parent / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(enriched, f, indent=2)
    logger.info(f"Wrote {len(enriched)} items to {out_path}")


if __name__ == '__main__':
    main()
