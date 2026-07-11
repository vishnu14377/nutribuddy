"""Zipcode geocoding and distance utilities for "restaurants near me"."""

import logging
import math
import re
from functools import lru_cache
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)

ZIP_RE = re.compile(r'^\d{5}$')
GEOCODE_URL = 'https://api.zippopotam.us/us/{zipcode}'


class InvalidZipcode(ValueError):
    pass


class GeocodeUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=512)
def geocode_zip(zipcode: str) -> Tuple[float, float]:
    """US zipcode -> (latitude, longitude) via the free zippopotam.us API.

    Cached per process; raises InvalidZipcode for bad input / unknown zips and
    GeocodeUnavailable when the service can't be reached.
    """
    zipcode = (zipcode or '').strip()
    if not ZIP_RE.match(zipcode):
        raise InvalidZipcode(f"'{zipcode}' is not a valid 5-digit US zipcode")
    try:
        resp = requests.get(GEOCODE_URL.format(zipcode=zipcode), timeout=6)
    except requests.RequestException as e:
        raise GeocodeUnavailable(f"Geocoding service unreachable: {e}") from e
    if resp.status_code == 404:
        raise InvalidZipcode(f"Unknown US zipcode '{zipcode}'")
    if resp.status_code != 200:
        raise GeocodeUnavailable(f"Geocoding service returned {resp.status_code}")
    try:
        place = resp.json()['places'][0]
        return float(place['latitude']), float(place['longitude'])
    except (KeyError, IndexError, ValueError) as e:
        raise GeocodeUnavailable(f"Unexpected geocoding response: {e}") from e


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two coordinates, in kilometers."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
