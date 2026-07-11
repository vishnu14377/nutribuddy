/**
 * Format a recipe price for display.
 *
 * Contract with the backend: `price` is MAJOR currency units (12.99 == $12.99);
 * `currency` is an ISO 4217 code or null when the source currency is unknown.
 * Unknown currency renders a bare number — never a guessed symbol.
 *
 * @param {{ price?: number, currency?: string }} recipe
 * @returns {string|null} formatted price, or null when there is nothing to show
 */
export function formatPrice(recipe) {
  if (!recipe?.price || recipe.price <= 0) return null;

  if (recipe.currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: recipe.currency,
      }).format(recipe.price);
    } catch {
      // Invalid/unsupported code from a partner: fall through to bare number
    }
  }
  return recipe.price.toFixed(2);
}
