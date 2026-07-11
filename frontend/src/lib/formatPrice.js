/**
 * Format a recipe price for display.
 *
 * Contract with the backend: `price` is MAJOR currency units (12.99 == $12.99);
 * `currency` is an ISO 4217 code or null when the source currency is unknown.
 * An unlabeled number is not a price a buyer can act on, so unknown currency
 * hides the price entirely — never a bare number, never a guessed symbol.
 *
 * @param {{ price?: number, currency?: string }} recipe
 * @returns {string|null} formatted price, or null when there is nothing to show
 */
export function formatPrice(recipe) {
  if (!recipe?.price || recipe.price <= 0 || !recipe.currency) return null;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: recipe.currency,
    }).format(recipe.price);
  } catch {
    // Invalid/unsupported code slipped past backend validation: hide rather
    // than mislabel.
    return null;
  }
}
