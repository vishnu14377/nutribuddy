"""Re-estimate nutrition for items sharing template macro tuples.

The batch estimator converged on identical tuples for similar items (10 pizzas
at exactly 2200/90/240/100), which reads as fabricated data. This finds tuples
shared by >=3 items in the ubereats fixture and re-asks per item with an
explicit anti-template, size-aware correction note.
"""

import json
import os
import sys
import logging
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from services.openai_service import OpenAIService
from utils.tags import sanitize_dietary_tags

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger(__name__)

FIXTURE = Path(__file__).resolve().parent.parent / 'data' / 'fixtures' / 'ubereats.json'


def main():
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
    items = json.load(open(FIXTURE))

    def tup(it):
        return (it['estimated_calories'], it['estimated_protein'],
                it['estimated_carbs'], it['estimated_fat'])

    counts = Counter(tup(it) for it in items)
    templated = [it for it in items if counts[tup(it)] >= 3]
    logger.info(f"{len(templated)} items share template tuples "
                f"({sum(1 for c in counts.values() if c >= 3)} distinct tuples)")

    svc = OpenAIService(api_key=os.environ['OPENAI_API_KEY'])
    fixed = 0
    for i, it in enumerate(templated):
        note = (
            "Your previous estimate for this item was a generic template value "
            "shared with many other items. Estimate THIS SPECIFIC item: honor any "
            "size/portion words in the name (a Small 10\" pizza is ~1000-1400 kcal "
            "whole; a Large 14-16\" is ~1800-2800; 10 wings carry ~50-70g protein, "
            "not 90+). Differentiate by size and toppings; do not reuse round "
            "template numbers."
        )
        n = svc.estimate_nutrition(
            it['name'], it.get('description', ''),
            restaurant_name=it.get('restaurant_name', ''),
            price=it.get('price'), currency=it.get('currency', ''),
            correction_note=note,
        )
        it['estimated_calories'] = n['calories']
        it['estimated_protein'] = float(n['protein'])
        it['estimated_carbs'] = float(n['carbs'])
        it['estimated_fat'] = float(n['fat'])
        it['dietary_tags'] = sanitize_dietary_tags(
            n.get('dietary_tags', []), carbs=it['estimated_carbs'],
            protein=it['estimated_protein'], name=it['name'],
            description=it.get('description') or '')
        fixed += 1
        if (i + 1) % 10 == 0:
            logger.info(f"Re-estimated {i + 1}/{len(templated)}")

    json.dump(items, open(FIXTURE, 'w'), indent=2)
    counts_after = Counter(
        (it['estimated_calories'], it['estimated_protein'], it['estimated_carbs'], it['estimated_fat'])
        for it in items)
    worst = counts_after.most_common(3)
    logger.info(f"Done: {fixed} re-estimated. Most-shared tuples now: {worst}")


if __name__ == '__main__':
    main()
