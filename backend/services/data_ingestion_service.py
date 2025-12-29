"""Data ingestion service for extracting menu items from Uber Eats Excel data."""

import pandas as pd
import uuid
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class DataIngestionService:
    """Service for extracting and processing menu items from Uber Eats data."""
    
    @staticmethod
    def extract_menu_items_from_excel(file_path: str, limit: int = 500) -> List[Dict[str, Any]]:
        """Extract individual menu items from Uber Eats Excel export.
        
        The Excel file has a nested structure where each row is a restaurant,
        and menu items are in columns like:
        - featuredItems/0/title, featuredItems/1/title, etc.
        - menu/0/catalogItems/0/title, etc.
        
        Args:
            file_path: Path to the Excel file
            limit: Maximum number of items to extract
            
        Returns:
            List of menu item dictionaries
        """
        df = pd.read_excel(file_path)
        logger.info(f"Read {len(df)} rows (restaurants) from Excel")
        
        items = []
        
        for idx, row in df.iterrows():
            restaurant_name = str(row.get('title', ''))
            if restaurant_name == 'nan' or not restaurant_name:
                continue
            
            # Get restaurant info
            cuisine = DataIngestionService._get_cuisine_list(row)
            logo_url = str(row.get('logoImageUrl', ''))
            
            # Extract featured items (columns like featuredItems/0/title)
            for i in range(20):  # Usually up to 20 featured items
                title_col = f'featuredItems/{i}/title'
                if title_col in df.columns:
                    title = str(row.get(title_col, ''))
                    if title and title != 'nan':
                        item = DataIngestionService._extract_item(
                            row, i, 'featuredItems', restaurant_name, cuisine, logo_url
                        )
                        if item:
                            items.append(item)
                            if len(items) >= limit:
                                logger.info(f"Reached limit of {limit} items")
                                return items
            
            # Extract menu catalog items (columns like menu/0/catalogItems/0/title)
            for menu_idx in range(5):  # Usually up to 5 menu sections
                for item_idx in range(30):  # Up to 30 items per section
                    title_col = f'menu/{menu_idx}/catalogItems/{item_idx}/title'
                    if title_col in df.columns:
                        title = str(row.get(title_col, ''))
                        if title and title != 'nan':
                            item = DataIngestionService._extract_catalog_item(
                                row, menu_idx, item_idx, restaurant_name, cuisine, logo_url
                            )
                            if item:
                                items.append(item)
                                if len(items) >= limit:
                                    logger.info(f"Reached limit of {limit} items")
                                    return items
        
        logger.info(f"Extracted {len(items)} menu items from {len(df)} restaurants")
        return items
    
    @staticmethod
    def _get_cuisine_list(row) -> str:
        """Extract cuisine types from row."""
        cuisines = []
        for i in range(5):
            col = f'cuisineList/{i}'
            val = row.get(col, '')
            if val and str(val) != 'nan':
                cuisines.append(str(val))
        return ', '.join(cuisines) if cuisines else 'Various'
    
    @staticmethod
    def _extract_item(row, idx: int, prefix: str, restaurant_name: str, cuisine: str, logo_url: str) -> Dict[str, Any]:
        """Extract a featured item from a row."""
        try:
            title = str(row.get(f'{prefix}/{idx}/title', ''))
            if not title or title == 'nan':
                return None
            
            description = str(row.get(f'{prefix}/{idx}/itemDescription', ''))
            if description == 'nan':
                description = ''
            
            price_raw = row.get(f'{prefix}/{idx}/price', 0)
            try:
                if isinstance(price_raw, str):
                    price = float(price_raw.replace('$', '').replace(',', ''))
                else:
                    price = float(price_raw) if price_raw and str(price_raw) != 'nan' else 0
                # If price > 100, it's likely in cents - convert to dollars
                if price > 100:
                    price = price / 100
            except:
                price = 0
            
            image_url = str(row.get(f'{prefix}/{idx}/imageUrl', ''))
            if image_url == 'nan':
                image_url = logo_url if logo_url != 'nan' else ''
            
            rating = row.get(f'{prefix}/{idx}/rating', 0)
            try:
                rating = float(rating) if rating and str(rating) != 'nan' else 0
            except:
                rating = 0
            
            item_uuid = str(row.get(f'{prefix}/{idx}/uuid', ''))
            
            return {
                'id': str(uuid.uuid4()),
                'name': title[:200],
                'description': description[:500],
                'restaurant_name': restaurant_name[:100],
                'cuisine_type': cuisine[:50],
                'image_url': image_url,
                'price': price,
                'rating': rating,
                'uber_uuid': item_uuid if item_uuid != 'nan' else '',
                'spice_level': 'Medium'
            }
        except Exception as e:
            logger.error(f"Error extracting item: {e}")
            return None
    
    @staticmethod
    def _extract_catalog_item(row, menu_idx: int, item_idx: int, restaurant_name: str, cuisine: str, logo_url: str) -> Dict[str, Any]:
        """Extract a catalog menu item from a row."""
        try:
            prefix = f'menu/{menu_idx}/catalogItems/{item_idx}'
            
            title = str(row.get(f'{prefix}/title', ''))
            if not title or title == 'nan':
                return None
            
            description = str(row.get(f'{prefix}/itemDescription', ''))
            if description == 'nan':
                description = ''
            
            price_raw = row.get(f'{prefix}/price', 0)
            try:
                if isinstance(price_raw, str):
                    price = float(price_raw.replace('$', '').replace(',', ''))
                else:
                    price = float(price_raw) if price_raw and str(price_raw) != 'nan' else 0
            except:
                price = 0
            
            image_url = str(row.get(f'{prefix}/imageUrl', ''))
            if image_url == 'nan':
                image_url = logo_url if logo_url != 'nan' else ''
            
            rating = row.get(f'{prefix}/rating', 0)
            try:
                rating = float(rating) if rating and str(rating) != 'nan' else 0
            except:
                rating = 0
            
            item_uuid = str(row.get(f'{prefix}/uuid', ''))
            
            return {
                'id': str(uuid.uuid4()),
                'name': title[:200],
                'description': description[:500],
                'restaurant_name': restaurant_name[:100],
                'cuisine_type': cuisine[:50],
                'image_url': image_url,
                'price': price,
                'rating': rating,
                'uber_uuid': item_uuid if item_uuid != 'nan' else '',
                'spice_level': 'Medium'
            }
        except Exception as e:
            logger.error(f"Error extracting catalog item: {e}")
            return None
