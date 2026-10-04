import { describe, expect, it } from "vitest";
import { BUNDLE_GREEN_COUNTS, canAddSelection } from "./bundleChoices";
import { PREORDER_BATCH, type Availability } from "./preorders";

describe("bundle colour choices", () => {
  it("offers each mix once with a mixed default", () => {
    for (const qty of [2, 3, 4] as const) {
      const choices = BUNDLE_GREEN_COUNTS[qty];
      expect(new Set(choices).size).toBe(qty + 1);
      expect([...choices].sort()).toEqual(Array.from({ length: qty + 1 }, (_, green) => green));
      expect(choices[0]).toBe(Math.ceil(qty / 2));
    }
  });

  it("checks each colour including quantities already in the bag", () => {
    const stock: Availability = { green: 2, cream: 1, preorder: { green: 0, cream: 2 }, batch: PREORDER_BATCH, timing: "Expected 15 October", localTest: false };
    const cart = { green: 1, cream: 0 };
    expect(canAddSelection({ green: 1, cream: 3 }, cart, stock)).toBe(true);
    expect(canAddSelection({ green: 2, cream: 2 }, cart, stock)).toBe(false);
    expect(canAddSelection({ green: 0, cream: 4 }, cart, stock)).toBe(false);
  });
});
