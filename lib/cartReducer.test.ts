import { describe, it, expect } from "vitest";
import { cartReducer, emptyCart, cartCount, cartSubtotal, type CartState } from "./cartReducer";

describe("cartReducer", () => {
  it("starts empty", () => {
    expect(cartCount(emptyCart)).toBe(0);
    expect(cartSubtotal(emptyCart)).toBe(0);
  });

  it("adds quantity for a colour", () => {
    const s = cartReducer(emptyCart, { type: "add", colour: "green", qty: 2 });
    expect(s.green).toBe(2);
    expect(cartCount(s)).toBe(2);
  });

  it("accumulates repeated adds of the same colour", () => {
    let s: CartState = emptyCart;
    s = cartReducer(s, { type: "add", colour: "green", qty: 1 });
    s = cartReducer(s, { type: "add", colour: "green", qty: 2 });
    expect(s.green).toBe(3);
  });

  it("sets an absolute quantity and clamps at zero", () => {
    let s = cartReducer(emptyCart, { type: "set", colour: "cream", qty: 5 });
    expect(s.cream).toBe(5);
    s = cartReducer(s, { type: "set", colour: "cream", qty: -3 });
    expect(s.cream).toBe(0);
  });

  it("removes a colour", () => {
    let s = cartReducer(emptyCart, { type: "add", colour: "green", qty: 2 });
    s = cartReducer(s, { type: "remove", colour: "green" });
    expect(s.green).toBe(0);
  });

  it("computes subtotal using per-colour bundle pricing", () => {
    // green x3 (1482) + cream x1 (549) = 2031
    let s = cartReducer(emptyCart, { type: "add", colour: "green", qty: 3 });
    s = cartReducer(s, { type: "add", colour: "cream", qty: 1 });
    expect(cartSubtotal(s)).toBe(2031);
    expect(cartCount(s)).toBe(4);
  });
});
