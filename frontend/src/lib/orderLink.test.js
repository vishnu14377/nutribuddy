import { buildOrderLink, buildSearchTerm } from "./orderLink";

describe("buildSearchTerm", () => {
  test("joins dish and restaurant, stripping trailing location parenthetical", () => {
    expect(
      buildSearchTerm({ name: "Cheese Pizza", restaurant_name: "Wiseguy Pizza (Navy Yard)" })
    ).toBe("Cheese Pizza Wiseguy Pizza");
  });

  test("strips piece counts and em-dash separators so platform search resolves", () => {
    expect(
      buildSearchTerm({ name: "10 pc Classic Wings — Lemon Pepper", restaurant_name: "Wingstop" })
    ).toBe("Classic Wings Lemon Pepper Wingstop");
  });

  test("dish-only term when restaurant is missing", () => {
    expect(buildSearchTerm({ name: "Keto Bowl" })).toBe("Keto Bowl");
  });
});

describe("buildOrderLink", () => {
  test("ubereats items get a search deep link", () => {
    const { url, platformLabel, copyable } = buildOrderLink({
      name: "Grilled Nuggets", restaurant_name: "Chick-fil-A", source_platform: "ubereats",
    });
    expect(url).toBe("https://www.ubereats.com/search?q=Grilled%20Nuggets%20Chick-fil-A");
    expect(platformLabel).toBe("Uber Eats");
    expect(copyable).toBe(true);
  });

  test("doordash items get a store search link", () => {
    const { url } = buildOrderLink({
      name: "Harvest Bowl", restaurant_name: "sweetgreen", source_platform: "doordash",
    });
    expect(url).toBe("https://www.doordash.com/search/store/Harvest%20Bowl%20sweetgreen");
  });

  test("biterush has no destination: no url, not copyable", () => {
    const { url, copyable, platformLabel } = buildOrderLink({
      name: "Keto Steak & Eggs", restaurant_name: "BiteRush Kitchen", source_platform: "biterush",
    });
    expect(url).toBeNull();
    expect(copyable).toBe(false);
    expect(platformLabel).toBe("BiteRush");
  });

  test("unknown platform is never relabeled as another platform's CTA", () => {
    const { url, platformLabel } = buildOrderLink({
      name: "Nasi Lemak", restaurant_name: "Hawker 45", source_platform: "grabfood",
    });
    expect(url).toBeNull();
    expect(platformLabel).toBe("grabfood");
  });

  test("backend-provided https order_url wins", () => {
    const { url } = buildOrderLink({
      name: "X", source_platform: "ubereats",
      order_url: "https://www.ubereats.com/store/wiseguy/abc123",
    });
    expect(url).toBe("https://www.ubereats.com/store/wiseguy/abc123");
  });

  test("javascript: order_url is rejected", () => {
    const { url } = buildOrderLink({
      name: "Evil", restaurant_name: "R", source_platform: "doordash",
      // eslint-disable-next-line no-script-url
      order_url: "javascript:alert(1)",
    });
    expect(url).toBe("https://www.doordash.com/search/store/Evil%20R");
  });
});
