"""Unit tests for the Excel ingestion adapter, especially price normalization."""

import pandas as pd
import pytest

from services.data_ingestion_service import DataIngestionService


class TestNormalizePrice:
    """Price contract: adapter emits MAJOR currency units."""

    @pytest.mark.parametrize('raw,unit,expected', [
        (2069.0, 'minor', 20.69),     # Apify numeric cents
        (574.0, 'minor', 5.74),
        (101.0, 'minor', 1.01),       # would have been mangled by old >100 heuristic
        (99.0, 'minor', 0.99),
        ('$12.99', 'minor', 12.99),   # $-strings are already major units
        ('$1,299.00', 'minor', 1299.0),
        (12.99, 'major', 12.99),
        (0, 'minor', 0.0),
        (None, 'minor', 0.0),
        (float('nan'), 'minor', 0.0),
        ('nan', 'minor', 0.0),
        ('', 'minor', 0.0),
        ('garbage', 'minor', 0.0),
    ])
    def test_normalization(self, raw, unit, expected):
        assert DataIngestionService._normalize_price(raw, numeric_unit=unit) == expected


def make_df(rows):
    return pd.DataFrame(rows)


class TestExcelExtraction:
    def test_featured_and_catalog_items_both_normalized(self, tmp_path):
        df = make_df([{
            'title': 'Test Pizzeria',
            'cuisineList/0': 'Pizza',
            'logoImageUrl': 'http://img/logo.png',
            'featuredItems/0/title': 'Cheese Pizza',
            'featuredItems/0/itemDescription': 'Classic cheese',
            'featuredItems/0/price': 2069.0,
            'featuredItems/0/imageUrl': 'http://img/cheese.png',
            'featuredItems/0/uuid': 'uuid-feat',
            'menu/0/catalogItems/0/title': 'French Fries',
            'menu/0/catalogItems/0/itemDescription': 'Crispy fries',
            'menu/0/catalogItems/0/price': 574.0,
            'menu/0/catalogItems/0/imageUrl': 'http://img/fries.png',
            'menu/0/catalogItems/0/uuid': 'uuid-cat',
        }])
        path = tmp_path / 't.xlsx'
        df.to_excel(path, index=False)

        items = DataIngestionService.extract_menu_items_from_excel(str(path))
        by_name = {i['name']: i for i in items}

        # Both paths agree: cents -> major units
        assert by_name['Cheese Pizza']['price'] == 20.69
        assert by_name['French Fries']['price'] == 5.74
        # Currency + platform stamped explicitly
        assert all(i['currency'] == 'USD' for i in items)
        assert all(i['source_platform'] == 'ubereats' for i in items)

    def test_sold_out_and_unavailable_items_skipped(self, tmp_path):
        df = make_df([{
            'title': 'Test Kitchen',
            'featuredItems/0/title': 'Sold Out Dish',
            'featuredItems/0/price': 1000.0,
            'featuredItems/0/isSoldOut': True,
            'featuredItems/1/title': 'Unavailable Dish',
            'featuredItems/1/price': 1000.0,
            'featuredItems/1/isAvailable': False,
            'featuredItems/2/title': 'Available Dish',
            'featuredItems/2/price': 1000.0,
            'featuredItems/2/isSoldOut': False,
            'featuredItems/2/isAvailable': True,
        }])
        path = tmp_path / 't.xlsx'
        df.to_excel(path, index=False)

        items = DataIngestionService.extract_menu_items_from_excel(str(path))
        names = [i['name'] for i in items]
        assert names == ['Available Dish']

    def test_limit_respected(self, tmp_path):
        row = {'title': 'Busy Restaurant'}
        for i in range(10):
            row[f'featuredItems/{i}/title'] = f'Dish {i}'
            row[f'featuredItems/{i}/price'] = 1000.0
        path = tmp_path / 't.xlsx'
        make_df([row]).to_excel(path, index=False)

        items = DataIngestionService.extract_menu_items_from_excel(str(path), limit=4)
        assert len(items) == 4

    def test_missing_description_becomes_empty(self, tmp_path):
        df = make_df([{
            'title': 'Test Kitchen',
            'featuredItems/0/title': 'No Desc Dish',
            'featuredItems/0/price': 899.0,
        }])
        path = tmp_path / 't.xlsx'
        df.to_excel(path, index=False)
        items = DataIngestionService.extract_menu_items_from_excel(str(path))
        assert items[0]['description'] == ''
