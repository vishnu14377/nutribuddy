"""Tests for zipcode geocoding, distance math, and the Apify normalizer."""

import pytest

from services import location_service
from services.location_service import InvalidZipcode, geocode_zip, haversine_km
from connectors.apify_connector import ApifyUberEatsConnector


class TestZipValidation:
    @pytest.mark.parametrize('bad', ['', '1234', '123456', 'abcde', '20009-', None])
    def test_invalid_zip_rejected_without_network(self, bad):
        with pytest.raises(InvalidZipcode):
            geocode_zip(bad)


class TestGeocode:
    def test_geocode_parses_response(self, monkeypatch):
        class FakeResp:
            status_code = 200
            def json(self):
                return {'places': [{'latitude': '38.9187', 'longitude': '-77.0364'}]}
        monkeypatch.setattr(location_service.requests, 'get', lambda *a, **k: FakeResp())
        geocode_zip.cache_clear()
        assert geocode_zip('20009') == (38.9187, -77.0364)
        geocode_zip.cache_clear()

    def test_unknown_zip_is_invalid(self, monkeypatch):
        class FakeResp:
            status_code = 404
        monkeypatch.setattr(location_service.requests, 'get', lambda *a, **k: FakeResp())
        geocode_zip.cache_clear()
        with pytest.raises(InvalidZipcode):
            geocode_zip('99999')
        geocode_zip.cache_clear()


class TestHaversine:
    def test_zero_distance(self):
        assert haversine_km(38.9, -77.0, 38.9, -77.0) == 0

    def test_known_distance_dc_to_baltimore(self):
        d = haversine_km(38.9072, -77.0369, 39.2904, -76.6122)
        assert 50 < d < 65  # ~56 km


def store_row(**overrides):
    row = {
        'title': 'Testaurant (Main St)',
        'url': 'https://www.ubereats.com/store/testaurant/abc-123',
        'storeUuid': 'abc-123',
        'latitude': 40.69,
        'longitude': -75.21,
        'address': {'postalCode': '18042'},
        'currencyCode': 'USD',
        'isOrderable': True,
        'ratingValue': 4.6,
        'cuisineList': ['American', 'Burgers'],
        'menuItems': [
            {'name': 'Smash Burger', 'description': 'Two patties', 'price': 12.49,
             'currency': 'USD', 'imageUrl': None, 'section': 'Burgers'},
            {'name': 'Fries', 'description': '', 'price': 4.99, 'currency': 'USD',
             'imageUrl': None, 'section': 'Sides'},
        ],
    }
    row.update(overrides)
    return row


class TestApifyNormalization:
    def test_normalizes_orderable_store(self):
        recipes = ApifyUberEatsConnector.normalize_rows([store_row()])
        assert len(recipes) == 2
        burger = recipes[0]
        assert burger.price == 12.49                     # major units, untouched
        assert burger.currency == 'USD'
        assert burger.source_platform == 'ubereats'
        assert burger.order_url.startswith('https://www.ubereats.com/store/')
        assert burger.latitude == 40.69
        assert burger.postal_code == '18042'
        assert burger.uber_uuid == 'abc-123'

    def test_unorderable_and_menuless_stores_skipped(self):
        rows = [
            store_row(isOrderable=False),
            store_row(menuItems=[]),
        ]
        assert ApifyUberEatsConnector.normalize_rows(rows) == []

    def test_items_per_store_cap_and_dedupe(self):
        many = [
            {'name': f'Dish {i}', 'price': 9.99, 'currency': 'USD', 'description': '', 'imageUrl': None}
            for i in range(20)
        ] + [{'name': 'Dish 0', 'price': 9.99, 'currency': 'USD', 'description': '', 'imageUrl': None}]
        recipes = ApifyUberEatsConnector.normalize_rows(
            [store_row(menuItems=many)], items_per_store=5)
        assert len(recipes) == 5
        assert len({r.name for r in recipes}) == 5

    def test_zero_priced_items_dropped(self):
        rows = [store_row(menuItems=[
            {'name': 'Freebie', 'price': 0, 'currency': 'USD', 'description': '', 'imageUrl': None},
            {'name': 'Real Dish', 'price': 8.5, 'currency': 'USD', 'description': '', 'imageUrl': None},
        ])]
        recipes = ApifyUberEatsConnector.normalize_rows(rows)
        assert [r.name for r in recipes] == ['Real Dish']

    def test_postal_from_address_text_fallback(self):
        row = store_row(address={}, addressText='123 Main St, Easton, PA 18042-1234, US')
        recipes = ApifyUberEatsConnector.normalize_rows([row])
        assert recipes[0].postal_code == '18042'
