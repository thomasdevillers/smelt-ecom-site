import { describe, it, expect } from "vitest";
import { BASE_PRICE, FREE_SHIP_THRESHOLD, unitPrice, lineTotal, formatMoney, qualifiesForFreeShipping } from "./pricing";

describe("pricing", () => {
  it("has the mockup base price", () => {
    expect(BASE_PRICE).toBe(549);
  });

  it("charges full price for a single hat", () => {
    expect(unitPrice(1)).toBe(549);
    expect(lineTotal(1)).toBe(549);
  });

  it("applies 5% off each at qty 2", () => {
    expect(unitPrice(2)).toBe(522);
    expect(lineTotal(2)).toBe(1044);
  });

  it("applies 10% off each at qty 3", () => {
    expect(unitPrice(3)).toBe(494);
    expect(lineTotal(3)).toBe(1482);
  });

  it("keeps the best (10%) tier for qty above 3", () => {
    expect(unitPrice(4)).toBe(494);
    expect(lineTotal(4)).toBe(1976);
  });

  it("formats money with a space thousands separator", () => {
    expect(formatMoney(549)).toBe("R549");
    expect(formatMoney(1578)).toBe("R1 578");
    expect(formatMoney(0)).toBe("R0");
  });

  it("qualifies for free shipping strictly above the threshold", () => {
    expect(FREE_SHIP_THRESHOLD).toBe(1000);
    expect(qualifiesForFreeShipping(1000)).toBe(false);
    expect(qualifiesForFreeShipping(1001)).toBe(true);
  });
});
