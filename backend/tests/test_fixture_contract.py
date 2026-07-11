"""Contract tests for every checked-in fixture dataset.

If a fixture drifts from the connector contract (see connectors/base.py),
seeding would fail or poison the search index — catch it here instead.
"""

import pytest

from connectors.fixture_connector import FixtureConnector, FIXTURES_DIR

FIXTURE_PLATFORMS = sorted(p.stem for p in FIXTURES_DIR.glob('*.json'))

# Platforms whose fixtures must carry full commercial data. 'biterush' is the
# legacy partner seed: currency intentionally unknown until the partner confirms.
STRICT_PLATFORMS = {'ubereats', 'doordash'}


@pytest.mark.parametrize('platform', FIXTURE_PLATFORMS)
class TestFixtureContract:
    def test_loads_and_validates(self, platform):
        items = FixtureConnector(platform).fetch_items()
        assert len(items) > 0

    def test_names_and_restaurants_present(self, platform):
        for item in FixtureConnector(platform).fetch_items():
            assert item.name.strip(), f'empty name in {platform}'
            assert item.restaurant_name and item.restaurant_name.strip()

    def test_platform_stamped_correctly(self, platform):
        for item in FixtureConnector(platform).fetch_items():
            assert item.source_platform == platform

    def test_nutrition_precomputed(self, platform):
        for item in FixtureConnector(platform).fetch_items():
            assert item.estimated_calories and item.estimated_calories > 0, \
                f'{platform}: {item.name} missing calories'
            assert item.estimated_protein is not None

    def test_no_duplicate_dishes(self, platform):
        items = FixtureConnector(platform).fetch_items()
        keys = [(i.restaurant_name, i.name.lower()) for i in items]
        assert len(keys) == len(set(keys))

    def test_prices_and_currency(self, platform):
        for item in FixtureConnector(platform).fetch_items():
            if platform in STRICT_PLATFORMS:
                assert item.price and item.price > 0, f'{platform}: {item.name} has no price'
                assert item.price < 500, \
                    f'{platform}: {item.name} price {item.price} looks like minor units'
                assert item.currency == 'USD'


def test_unknown_platform_raises():
    with pytest.raises(FileNotFoundError):
        FixtureConnector('grubhub').fetch_items()
