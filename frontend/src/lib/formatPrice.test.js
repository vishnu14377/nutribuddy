import { formatPrice } from "./formatPrice";

describe("formatPrice", () => {
  test("formats USD major units", () => {
    expect(formatPrice({ price: 12.99, currency: "USD" })).toMatch(/12\.99/);
  });

  test("formats INR with its own symbol/code", () => {
    const out = formatPrice({ price: 249, currency: "INR" });
    expect(out).toMatch(/249/);
    expect(out).not.toMatch(/^\$/); // never a plain dollar sign for rupees
  });

  test("JPY renders without decimals", () => {
    expect(formatPrice({ price: 900, currency: "JPY" })).not.toMatch(/900\.00/);
  });

  test("unknown currency hides the price entirely (no bare numbers)", () => {
    expect(formatPrice({ price: 349, currency: null })).toBeNull();
    expect(formatPrice({ price: 349 })).toBeNull();
  });

  test("invalid currency code hides rather than mislabels", () => {
    expect(formatPrice({ price: 10, currency: "NOPE" })).toBeNull();
  });

  test("zero/missing price hides", () => {
    expect(formatPrice({ price: 0, currency: "USD" })).toBeNull();
    expect(formatPrice({ currency: "USD" })).toBeNull();
    expect(formatPrice(null)).toBeNull();
  });
});
