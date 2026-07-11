"""OpenAI service for embeddings and nutrition estimation."""

import openai
from typing import List, Dict, Any
import logging
import json

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for OpenAI embeddings and GPT-based nutrition estimation."""

    def __init__(self, api_key: str):
        """Initialize OpenAI service.

        Args:
            api_key: OpenAI API key
        """
        self.client = openai.OpenAI(api_key=api_key)
        self.embedding_model = "text-embedding-3-large"
        self.embedding_dimensions = 1536  # Reduced for efficiency, still excellent performance
        self.chat_model = "gpt-4o"
        logger.info(f"OpenAI Service initialized with model: {self.embedding_model}")

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector using OpenAI.

        Args:
            text: Text to embed

        Returns:
            List of embedding values (1536 dimensions)
        """
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
                dimensions=self.embedding_dimensions
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for many texts in a single API call.

        Args:
            texts: Texts to embed (OpenAI accepts up to 2048 inputs per request)

        Returns:
            List of embedding vectors, in the same order as the input texts
        """
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=texts,
                dimensions=self.embedding_dimensions
            )
            # API preserves input order; sort by index defensively
            return [d.embedding for d in sorted(response.data, key=lambda d: d.index)]
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise

    def estimate_nutrition(
        self,
        name: str,
        description: str = "",
        restaurant_name: str = "",
        price: float = None,
        currency: str = "",
        correction_note: str = "",
    ) -> Dict[str, Any]:
        """Estimate nutritional values for a menu item using GPT-4o.

        Estimates cover the ENTIRE item as sold — a whole pizza gets whole-pie
        macros, never per-slice. Restaurant and price context anchor the
        portion size (a $29.90 item is not a 150-calorie snack).

        Args:
            name: Menu item name
            description: Menu item description
            restaurant_name: Restaurant selling the item (portion context)
            price: Item price in major currency units (portion context)
            currency: ISO 4217 code for the price
            correction_note: Feedback appended when re-asking after an
                implausible first estimate

        Returns:
            Dictionary with estimated calories, protein, carbs, fat
        """
        price_line = f"Price: {currency or ''} {price:.2f}".strip() if price else "Price: unknown"
        prompt = f"""You are a nutrition expert. Estimate the nutritional values for this menu item.

Menu Item: {name}
Restaurant: {restaurant_name or 'Unknown'}
Description: {description if description else 'No description available'}
{price_line}

CRITICAL RULES:
- Estimate the ENTIRE item exactly as it is sold and delivered. If the item is
  a whole pizza, estimate the WHOLE pie (a whole cheese pizza is ~1800-2400
  kcal, never 250-350 — that is one slice). If it is "10 pc wings", estimate
  all 10 pieces. If a size is in the name (14", large, footlong), honor it.
- Use the price as a portion sanity check: a $25+ item from a restaurant is a
  large/whole item, not a snack. If your calorie estimate implies less than
  ~40 kcal per dollar for an entree, re-check your portion assumption.
- Item names at pizzerias like "Pepperoni" or "Cheese" refer to WHOLE PIZZAS,
  not toppings or slices.
- dietary_tags must reflect the whole item: never tag "keto-friendly" above
  15g carbs, "low-carb" above 30g, or "high-protein" below 30g protein.
  Never tag "vegetarian"/"vegan" if the name or description mentions meat,
  poultry, or fish.
{f'- CORRECTION: {correction_note}' if correction_note else ''}

Respond in JSON format ONLY with these fields:
{{
    "calories": <integer>,
    "protein": <integer in grams>,
    "carbs": <integer in grams>,
    "fat": <integer in grams>,
    "dietary_tags": [<list of applicable tags like "high-protein", "low-carb", "vegetarian", "vegan", "gluten-free", "keto-friendly">],
    "confidence": "<low/medium/high>"
}}

Typical whole-item anchors:
- Whole 14-16" pizza: 1800-2800 calories
- Wings (10pc): 800-1200 calories with 60-100g protein
- Pasta entree: 600-1000 calories
- Sandwich/sub (6"): 400-800; footlong: 700-1100
- Entree salad without heavy dressing: 200-500 calories

Only output the JSON, nothing else."""

        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a nutrition expert. Respond only with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=300
            )

            content = response.choices[0].message.content.strip()
            # Handle potential markdown code blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            nutrition = json.loads(content)
            return {
                "calories": int(nutrition.get("calories", 500)),
                "protein": int(nutrition.get("protein", 20)),
                "carbs": int(nutrition.get("carbs", 40)),
                "fat": int(nutrition.get("fat", 20)),
                "dietary_tags": nutrition.get("dietary_tags", []),
                "confidence": nutrition.get("confidence", "medium")
            }

        except Exception as e:
            logger.error(f"Error estimating nutrition for '{name}': {e}")
            # Return reasonable defaults
            return {
                "calories": 500,
                "protein": 20,
                "carbs": 40,
                "fat": 20,
                "dietary_tags": [],
                "confidence": "low"
            }
