"""Connector contract for delivery-platform menu sources.

Every connector normalizes its source's raw format into Recipe objects at the
boundary. The contract each connector MUST honor:

- price: MAJOR currency units as float (12.99 == $12.99), rounded to 2dp.
  Sources that deliver minor units (e.g. Apify Uber Eats numeric cents) convert
  here — never downstream.
- currency: ISO 4217 uppercase, stamped explicitly per source. Never guessed.
- source_platform: set to the connector's platform key (e.g. "ubereats").
- order_url: set when a canonical deep link is derivable, else None (the
  frontend falls back to a platform search URL / copy-paste term).
- nutrition fields: may be None (the ingest pipeline fills them via
  OpenAIService.estimate_nutrition) or pre-computed (fixtures).
"""

from typing import List, Protocol

from models.recipe import Recipe


class PlatformConnector(Protocol):
    """A source of normalized menu items for one delivery platform."""

    platform: str

    def fetch_items(self, limit: int = 500) -> List[Recipe]:
        """Return up to `limit` normalized menu items."""
        ...
