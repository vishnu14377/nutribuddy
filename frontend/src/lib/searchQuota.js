/**
 * Client-side free-tier search quota (POC paywall stub).
 *
 * THROWAWAY by design: per-browser, trivially bypassed, no server enforcement.
 * Its only job is to demo the subscription UX story. Never report its numbers
 * as willingness-to-pay or conversion evidence. Real gating happens later as a
 * FastAPI dependency on POST /api/search (see docs/monetization.md).
 */

export const FREE_SEARCHES_PER_DAY = parseInt(
  process.env.REACT_APP_FREE_SEARCHES_PER_DAY ?? "5",
  10
);

const STORAGE_KEY = "nb_search_quota";
const BYPASS_KEY = "nb_paywall_off";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readQuota() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { date: todayLocal(), used: 0 };
  const parsed = JSON.parse(raw);
  if (parsed.date !== todayLocal()) return { date: todayLocal(), used: 0 };
  return parsed;
}

/** Demo bypass: env flag, ?paywall=off URL param (persisted for the session), or session flag. */
export function isPaywallDisabled() {
  if (process.env.REACT_APP_DISABLE_PAYWALL === "true") return true;
  try {
    if (new URLSearchParams(window.location.search).get("paywall") === "off") {
      sessionStorage.setItem(BYPASS_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Consume one search from today's quota.
 * Fails OPEN on any storage error (private mode, blocked storage): search always works.
 *
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function consumeSearch() {
  if (isPaywallDisabled()) return { allowed: true, remaining: Infinity };
  try {
    const quota = readQuota();
    if (quota.used >= FREE_SEARCHES_PER_DAY) {
      return { allowed: false, remaining: 0 };
    }
    const next = { date: quota.date, used: quota.used + 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { allowed: true, remaining: FREE_SEARCHES_PER_DAY - next.used };
  } catch {
    return { allowed: true, remaining: FREE_SEARCHES_PER_DAY };
  }
}

/** Read-only remaining count for the quota badge. */
export function getRemaining() {
  if (isPaywallDisabled()) return Infinity;
  try {
    return Math.max(0, FREE_SEARCHES_PER_DAY - readQuota().used);
  } catch {
    return FREE_SEARCHES_PER_DAY;
  }
}
