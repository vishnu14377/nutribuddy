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

MEAT_WORDS = ('chicken', 'beef', 'steak', 'lamb', 'pork', 'bacon', 'turkey',
              'salmon', 'tuna', 'shrimp', 'fish', 'gyro', 'kofta', 'meatball',
              'pepperoni', 'sausage', 'wings', 'ham')


def _is_plausible(nutrition: dict, item: dict) -> str:
    """Return '' if plausible, else a correction note describing the problem."""
    calories = nutrition['calories']
    protein = nutrition['protein']
    price = item.get('price') or 0

    # A $20+ entree claiming snack calories = per-slice/per-piece estimate bug
    if price >= 15 and calories < max(40 * price, 300):
        return (f"Your estimate of {calories} kcal is implausibly low for a "
                f"{item.get('currency', '')} {price:.2f} item — you likely estimated a "
                f"slice/piece instead of the whole item as sold. Re-estimate the ENTIRE item.")
    if calories <= 0:
        return "Calories must be positive for a food item."
    name_desc = f"{item.get('name', '')} {item.get('description', '')}".lower()
    if protein <= 0 and any(w in name_desc for w in MEAT_WORDS + ('cheese', 'egg')):
        return "Protein of 0g is implausible for an item containing meat/cheese/egg."
    return ''


def _sanitize_tags(nutrition: dict, item: dict) -> list:
    """Enforce tag honesty regardless of what the model returned."""
    tags = list(nutrition.get('dietary_tags', []))
    carbs = nutrition['carbs']
    protein = nutrition['protein']
    name_desc = f"{item.get('name', '')} {item.get('description', '')}".lower()

    def drop(tag):
        return [t for t in tags if t != tag]

    if carbs > 15:
        tags = drop('keto-friendly')
    if carbs > 30:
        tags = drop('low-carb')
    if protein < 30:
        tags = drop('high-protein')
    if any(w in name_desc for w in MEAT_WORDS):
        tags = drop('vegetarian')
        tags = drop('vegan')
    return tags


def _estimate_with_plausibility_check(openai_service, item: dict):
    """Estimate nutrition; re-ask once with a correction note; None if still bad."""
    kwargs = dict(
        name=item['name'],
        description=item.get('description', ''),
        restaurant_name=item.get('restaurant_name', ''),
        price=item.get('price'),
        currency=item.get('currency', ''),
    )
    nutrition = openai_service.estimate_nutrition(**kwargs)
    problem = _is_plausible(nutrition, item)
    if not problem:
        return nutrition
    logger.info(f"Re-asking for {item['name']}: {problem}")
    nutrition = openai_service.estimate_nutrition(**kwargs, correction_note=problem)
    return None if _is_plausible(nutrition, item) else nutrition


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
    dropped = 0
    for i, item in enumerate(selected):
        nutrition = _estimate_with_plausibility_check(openai_service, item)
        if nutrition is None:
            dropped += 1
            logger.warning(f"Dropped implausible item: {item['name']} (${item['price']})")
            continue
        recipe = Recipe(**{
            **item,
            'estimated_calories': nutrition['calories'],
            'estimated_protein': nutrition['protein'],
            'estimated_carbs': nutrition['carbs'],
            'estimated_fat': nutrition['fat'],
            'dietary_tags': _sanitize_tags(nutrition, item),
        })
        enriched.append(recipe.model_dump())
        if (i + 1) % 10 == 0:
            logger.info(f"Estimated nutrition for {i + 1}/{len(selected)} items ({dropped} dropped)")
            time.sleep(0.5)
    if dropped:
        logger.warning(f"Dropped {dropped} items that failed plausibility after retry")

    out_path = Path(__file__).resolve().parent.parent / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(enriched, f, indent=2)
    logger.info(f"Wrote {len(enriched)} items to {out_path}")


if __name__ == '__main__':
    main()
