import {
  consumeSearch,
  refundSearch,
  getRemaining,
  FREE_SEARCHES_PER_DAY,
} from "./searchQuota";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("searchQuota", () => {
  test("default free tier is a positive finite number", () => {
    expect(Number.isFinite(FREE_SEARCHES_PER_DAY)).toBe(true);
    expect(FREE_SEARCHES_PER_DAY).toBeGreaterThan(0);
  });

  test("consumes down to zero then blocks", () => {
    for (let i = 0; i < FREE_SEARCHES_PER_DAY; i++) {
      expect(consumeSearch().allowed).toBe(true);
    }
    const blocked = consumeSearch();
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test("refund restores one search after a failed request", () => {
    consumeSearch();
    consumeSearch();
    expect(getRemaining()).toBe(FREE_SEARCHES_PER_DAY - 2);
    refundSearch();
    expect(getRemaining()).toBe(FREE_SEARCHES_PER_DAY - 1);
  });

  test("quota resets on a new local date", () => {
    localStorage.setItem(
      "nb_search_quota",
      JSON.stringify({ date: "2000-01-01", used: FREE_SEARCHES_PER_DAY })
    );
    expect(getRemaining()).toBe(FREE_SEARCHES_PER_DAY);
    expect(consumeSearch().allowed).toBe(true);
  });

  test("corrupt storage fails open", () => {
    localStorage.setItem("nb_search_quota", "not json{{");
    const result = consumeSearch();
    expect(result.allowed).toBe(true);
  });
});
