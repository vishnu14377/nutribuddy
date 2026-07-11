/**
 * Order-redirection helpers.
 *
 * Strategy (team-decided): web search deep links where a platform has a stable
 * public URL pattern (https links hand off to the installed native app via
 * universal links on mobile), with a copy-to-clipboard search term as the
 * guaranteed floor everywhere else.
 *
 * Upgrade path: when official platform APIs provide canonical store/item URLs,
 * the backend sets recipe.order_url and it wins over everything here. Note
 * that scraped uber_uuid values are item-scoped and can NOT be turned into
 * store-page links — search URLs stay the linkable unit until official APIs.
 *
 * This map is the single place future platforms (Grab, Foodpanda, Delivery
 * Hero) get added.
 */

export const DEFAULT_PLATFORM = process.env.REACT_APP_ORDER_PLATFORM || "ubereats";

export const PLATFORMS = {
  ubereats: {
    label: "Uber Eats",
    badgeClass: "bg-green-100 text-green-800",
    buildUrl: (term) => `https://www.ubereats.com/search?q=${encodeURIComponent(term)}`,
  },
  doordash: {
    label: "DoorDash",
    badgeClass: "bg-red-100 text-red-700",
    // No stable public search URL pattern verified yet -> copy-only fallback
    buildUrl: null,
  },
  biterush: {
    label: "BiteRush",
    badgeClass: "bg-orange-100 text-orange-700",
    buildUrl: null,
  },
};

/** Strip only trailing parenthetical location suffixes: "Wiseguy Pizza (Navy Yard)" -> "Wiseguy Pizza". */
function cleanRestaurantName(name) {
  return (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Build the search term a user would paste into the platform's search box. */
export function buildSearchTerm(recipe) {
  return [recipe.name, cleanRestaurantName(recipe.restaurant_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Resolve everything the order CTA needs for one recipe.
 *
 * @returns {{ url: string|null, searchTerm: string, platformLabel: string, badgeClass: string }}
 */
export function buildOrderLink(recipe) {
  const platformKey = recipe.source_platform || DEFAULT_PLATFORM;
  const platform = PLATFORMS[platformKey] || PLATFORMS[DEFAULT_PLATFORM];
  const searchTerm = buildSearchTerm(recipe);

  // A backend-provided canonical link always wins (validate scheme).
  if (recipe.order_url && /^https?:\/\//i.test(recipe.order_url)) {
    return { url: recipe.order_url, searchTerm, platformLabel: platform.label, badgeClass: platform.badgeClass };
  }

  return {
    url: platform.buildUrl && searchTerm ? platform.buildUrl(searchTerm) : null,
    searchTerm,
    platformLabel: platform.label,
    badgeClass: platform.badgeClass,
  };
}
