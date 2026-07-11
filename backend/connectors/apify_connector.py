"""Live Apify connector: zipcode -> real Uber Eats stores with full menus.

Wraps the memo23/uber-eats-scraper actor. Contract (connectors/base.py):
prices arrive in MAJOR USD units from this actor (verified against live
output), store page URLs become order_url (real deep links that open the
native app via universal links), and restaurant coordinates ride along for
zipcode-based discovery.

COST WARNING: actor runs bill the Apify account per store page (~$0.02/row
observed; a 50-row run cost $0.88 on 2026-07-11). This connector is for
INGEST-time refreshes only — never call it at query time. max_stores is a
hard requirement, not a default.
"""

import json
import logging
import time
import uuid
from typing import List, Optional

import requests

from models.recipe import Recipe
from services.location_service import geocode_zip

logger = logging.getLogger(__name__)

ACTOR_ID = 'memo23~uber-eats-scraper'
APIFY_BASE = 'https://api.apify.com/v2'
POLL_INTERVAL_S = 10
RUN_TIMEOUT_S = 600


class ApifyUberEatsConnector:
    """Fetch normalized Uber Eats menu items for a zipcode via Apify."""

    platform = 'ubereats'

    def __init__(self, token: str):
        if not token:
            raise ValueError('APIFY_TOKEN required for live scraping')
        self.token = token

    def fetch_items(self, zipcode: str, search_query: str = '', max_stores: int = 10,
                    items_per_store: int = 12) -> List[Recipe]:
        """Run the actor for a zipcode and normalize the results."""
        lat, lon = geocode_zip(zipcode)
        run = self._start_run(lat, lon, search_query, max_stores)
        dataset_id = self._wait_for_run(run['id'])
        rows = self._fetch_dataset(dataset_id)
        logger.info(f"Apify run {run['id']}: {len(rows)} store rows")
        return self.normalize_rows(rows, items_per_store=items_per_store)

    # ── Actor plumbing ───────────────────────────────────────────────────────

    def _start_run(self, lat: float, lon: float, search_query: str, max_stores: int) -> dict:
        resp = requests.post(
            f'{APIFY_BASE}/acts/{ACTOR_ID}/runs',
            params={'token': self.token},
            json={
                # Explicit coordinates: the actor's own address geocoding is
                # unreliable (a "Washington, DC" pilot landed in NJ/PA).
                'latitude': str(lat),
                'longitude': str(lon),
                'searchQuery': search_query or '',
                'maxItems': max_stores,
                'maxReviews': 0,
                'includeItemCustomizations': False,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()['data']

    def _wait_for_run(self, run_id: str) -> str:
        deadline = time.time() + RUN_TIMEOUT_S
        while time.time() < deadline:
            resp = requests.get(f'{APIFY_BASE}/actor-runs/{run_id}',
                                params={'token': self.token}, timeout=30)
            resp.raise_for_status()
            data = resp.json()['data']
            status = data['status']
            if status == 'SUCCEEDED':
                logger.info(f"Apify run {run_id} succeeded (${data.get('usageTotalUsd', '?')})")
                return data['defaultDatasetId']
            if status in ('FAILED', 'ABORTED', 'TIMED-OUT'):
                raise RuntimeError(f'Apify run {run_id} ended with status {status}')
            time.sleep(POLL_INTERVAL_S)
        raise TimeoutError(f'Apify run {run_id} did not finish within {RUN_TIMEOUT_S}s')

    def _fetch_dataset(self, dataset_id: str) -> List[dict]:
        resp = requests.get(f'{APIFY_BASE}/datasets/{dataset_id}/items',
                            params={'token': self.token, 'format': 'json'}, timeout=60)
        resp.raise_for_status()
        return resp.json()

    # ── Normalization (pure; also used to convert saved dataset files) ───────

    @classmethod
    def normalize_rows(cls, rows: List[dict], items_per_store: int = 12) -> List[Recipe]:
        """Actor store rows -> Recipe list honoring the connector contract."""
        recipes = []
        for store in rows:
            menu_items = store.get('menuItems') or []
            if not menu_items or not store.get('isOrderable', False):
                continue
            restaurant = (store.get('title') or '').strip()
            if not restaurant:
                continue
            store_url = store.get('url') or store.get('canonicalUrl') or None
            address = store.get('address') or {}
            postal = address.get('postalCode') or cls._postal_from_text(store.get('addressText'))
            cuisine = ', '.join(store.get('cuisineList') or [])[:50] or None

            seen_names = set()
            taken = 0
            for item in menu_items:
                if taken >= items_per_store:
                    break
                name = (item.get('name') or '').strip()
                price = item.get('price')
                if not name or not isinstance(price, (int, float)) or price <= 0:
                    continue
                key = name.lower()
                if key in seen_names:
                    continue
                seen_names.add(key)
                recipes.append(Recipe(
                    id=str(uuid.uuid4()),
                    name=name[:200],
                    description=(item.get('description') or '')[:500],
                    restaurant_name=restaurant[:100],
                    cuisine_type=cuisine,
                    image_url=item.get('imageUrl') or '',
                    price=round(float(price), 2),   # actor emits MAJOR units
                    currency=(item.get('currency') or store.get('currencyCode') or 'USD'),
                    source_platform=cls.platform,
                    order_url=store_url,
                    uber_uuid=store.get('storeUuid') or '',
                    rating=store.get('ratingValue') or 0,
                    latitude=store.get('latitude'),
                    longitude=store.get('longitude'),
                    postal_code=postal,
                    spice_level='Medium',
                ))
                taken += 1
        logger.info(f"Normalized {len(recipes)} menu items from {len(rows)} store rows")
        return recipes

    @staticmethod
    def _postal_from_text(address_text: Optional[str]) -> Optional[str]:
        if not address_text:
            return None
        import re
        m = re.search(r'\b(\d{5})(?:-\d{4})?\b(?!.*\d{5})', address_text)
        return m.group(1) if m else None
