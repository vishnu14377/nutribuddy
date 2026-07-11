"""Fixture-backed connector: reads checked-in JSON datasets shaped like
normalized Apify actor output.

This is the POC data source. When a real APIFY_TOKEN / official platform API
becomes available, add a live connector with the same interface and swap it in
at the call site — nothing downstream changes (see connectors/base.py for the
contract).
"""

import json
import logging
from pathlib import Path
from typing import List

from models.recipe import Recipe

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / 'data' / 'fixtures'


class FixtureConnector:
    """Loads normalized menu items for one platform from a JSON fixture file."""

    def __init__(self, platform: str, fixtures_dir: Path = FIXTURES_DIR):
        self.platform = platform
        self.fixture_path = Path(fixtures_dir) / f'{platform}.json'

    def fetch_items(self, limit: int = 500) -> List[Recipe]:
        if not self.fixture_path.exists():
            raise FileNotFoundError(f"No fixture for platform '{self.platform}' at {self.fixture_path}")

        with open(self.fixture_path) as f:
            raw_items = json.load(f)

        if not isinstance(raw_items, list):
            raise ValueError(f"{self.fixture_path} must contain a JSON array")

        items = []
        for i, raw in enumerate(raw_items[:limit]):
            try:
                recipe = Recipe(**raw)
            except Exception as e:
                raise ValueError(f"{self.fixture_path} item {i} violates the contract: {e}") from e
            if recipe.source_platform != self.platform:
                raise ValueError(
                    f"{self.fixture_path} item {i} has source_platform="
                    f"'{recipe.source_platform}', expected '{self.platform}'"
                )
            items.append(recipe)

        logger.info(f"FixtureConnector[{self.platform}]: loaded {len(items)} items")
        return items
