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

  it("applies the four-hat price across colours", () => {
    let s = cartReducer(emptyCart, { type: "add", colour: "green", qty: 3 });
    s = cartReducer(s, { type: "add", colour: "cream", qty: 1 });
    expect(cartSubtotal(s)).toBe(1600);
    expect(cartCount(s)).toBe(4);
  });
  it("adds the selected colour mix together and recalculates when hats are removed", () => {
    let s = cartReducer(emptyCart, { type: "addBundle", quantities: { green: 2, cream: 2 } });
    expect(s).toEqual({ green: 2, cream: 2 });
    expect(cartSubtotal(s)).toBe(1600);
    s = cartReducer(s, { type: "set", colour: "cream", qty: 1 });
    expect(cartSubtotal(s)).toBe(1250);
    s = cartReducer(s, { type: "remove", colour: "cream" });
    expect(cartSubtotal(s)).toBe(900);
    s = cartReducer(s, { type: "set", colour: "green", qty: 1 });
    expect(cartSubtotal(s)).toBe(450);
  });

});
