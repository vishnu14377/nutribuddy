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
    // General search carries dish + restaurant (Uber Eats parity); the
    // copyable term remains the floor.
    buildUrl: (term) => `https://www.doordash.com/search/store/${encodeURIComponent(term)}/`,
  },
  biterush: {
    label: "BiteRush",
    badgeClass: "bg-orange-100 text-orange-700",
    // First-party app (biterush/ in this monorepo). Per-item /food/<id> deep
    // links come from the backend order_url; this search URL is the fallback.
    buildUrl: (term) =>
      `${process.env.REACT_APP_BITERUSH_URL || "http://localhost:5173"}/search?q=${encodeURIComponent(term)}`,
  },
};

/** Strip only trailing parenthetical location suffixes: "Wiseguy Pizza (Navy Yard)" -> "Wiseguy Pizza". */
function cleanRestaurantName(name) {
  return (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Build the search term a user would paste into the platform's search box.
 * Piece counts, parenthetical annotations, and em-dash separators are stripped
 * so platform search can actually resolve it:
 * "10 pc Classic Wings — Lemon Pepper" -> "Classic Wings Lemon Pepper"
 * "Bunless Bacon Cheeseburger (Bowl)"  -> "Bunless Bacon Cheeseburger"
 */
export function buildSearchTerm(recipe) {
  const dish = (recipe.name || "")
    .replace(/^\d+\s*(?:pc|pcs|piece|pieces|ct)\b\.?\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+[—–-]{1,2}\s+/g, " ")
    .trim();
  return [dish, cleanRestaurantName(recipe.restaurant_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Resolve everything the order CTA needs for one recipe.
 *
 * copyable=false means the platform has no reachable destination (no URL and
 * nowhere to paste a search term) — render an informational state, not a CTA.
 *
 * @returns {{ url: string|null, searchTerm: string, platformLabel: string, badgeClass: string, copyable: boolean }}
 */
export function buildOrderLink(recipe) {
  const platformKey = recipe.source_platform || DEFAULT_PLATFORM;
  // An unknown platform must never be silently relabeled as another platform's
  // CTA — fall back to an honest generic entry (label = the platform key).
  const platform = PLATFORMS[platformKey] || {
    label: platformKey,
    badgeClass: "bg-gray-100 text-gray-600",
    buildUrl: null,
  };
  const searchTerm = buildSearchTerm(recipe);

  // A backend-provided canonical link always wins (validate scheme) — but a
  // localhost/dev URL is only usable when this app itself runs on localhost,
  // otherwise it dead-ends a real customer.
  const isDevHost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const urlIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(recipe.order_url || "");
  if (recipe.order_url && /^https?:\/\//i.test(recipe.order_url) && (!urlIsLocal || isDevHost)) {
    return {
      url: recipe.order_url,
      searchTerm,
      platformLabel: platform.label,
      badgeClass: platform.badgeClass,
      copyable: true,
    };
  }

  let built = platform.buildUrl && searchTerm ? platform.buildUrl(searchTerm, recipe) : null;
  // The constructed fallback gets the same localhost guard as backend URLs —
  // a misconfigured prod build must degrade to copy-search, not a dead link.
  if (built && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(built) && !isDevHost) {
    built = null;
  }
  return {
    url: built,
    searchTerm,
    platformLabel: platform.label,
    badgeClass: platform.badgeClass,
    copyable: !platform.noDestination && Boolean(searchTerm),
  };
}
