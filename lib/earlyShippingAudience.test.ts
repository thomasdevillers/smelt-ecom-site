import { describe, expect, it } from "vitest";
import { earlyShippingAudience, eligibleEarlyShippingOrder } from "./earlyShippingAudience";
import type { AdminOrder } from "./admin/types";

const order = (overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  reference: "preorder-1", email: "customer@example.com", amount: 49900, currency: "ZAR",
  items: [{ colour: "green", name: "Hat", qty: 1 }], preorder: { batch: "november" },
  completedAt: null, receipt: null, ...overrides,
} as AdminOrder);

describe("early shipping audience", () => {
  it("includes active preorders and deduplicates addresses", () => {
    const result = earlyShippingAudience([order(), order({ reference: "preorder-2", email: "CUSTOMER@example.com" })]);
    expect(result.customers).toEqual([{ email: "customer@example.com", references: ["preorder-1", "preorder-2"] }]);
  });
  it("excludes completed, shipped, non-preorder, invalid and payment-review orders", () => {
    for (const overrides of [
      { completedAt: "2026-11-20" }, { preorder: undefined }, { amount: 0 }, { currency: "USD" },
      { email: "invalid" }, { items: [] }, { reviewReason: "This payment has a refund or dispute requiring review." },
      { receipt: { status: "accepted" } }, { receipt: { status: "pending" } },
    ]) expect(eligibleEarlyShippingOrder(order(overrides as Partial<AdminOrder>))).toBe(false);
  });
  it("does not confuse the pre-order stock arrival warning with a payment problem", () => {
    expect(eligibleEarlyShippingOrder(order({ canShip: false, reviewReason: "Ships 30 November. Confirm the hats have been received in Restock requests before sending tracking." }))).toBe(true);
  });
});
