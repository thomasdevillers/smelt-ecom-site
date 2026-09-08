"use client";

import { track } from "@vercel/analytics";
import { cartCount, type CartState } from "./cartReducer";
import { PRODUCT, type Colour } from "./product";
import { lineTotal } from "./pricing";

type EventName = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";
type Properties = { product: string; colour: string; quantity: number; value: number; currency: string };
const purchases = new Set<string>();

export function vercelProductData(colour: Colour, quantity: number): Properties {
  return { product: PRODUCT.name, colour, quantity, value: lineTotal(quantity), currency: "ZAR" };
}

export function vercelCartData(cart: CartState, value: number): Properties {
  return {
    product: PRODUCT.name,
    colour: cart.green > 0 && cart.cream > 0 ? "mixed" : cart.green > 0 ? "green" : "cream",
    quantity: cartCount(cart), value, currency: "ZAR",
  };
}

export function trackVercelEvent(event: EventName, properties: Properties): boolean {
  if (typeof window === "undefined") return false;
  try {
    track(event, properties);
    return true;
  } catch {
    // Analytics failures must never break shopping or payment confirmation.
    return false;
  }
}

/** Call only with the successful server verifier response. Reference stays local. */
export function trackVercelPurchase(input: {
  paid?: boolean; reference?: string; amountRand?: number; currency?: string;
  items?: { colour: string; qty: number }[];
}): void {
  if (typeof window === "undefined" || input.paid !== true || !input.reference ||
      !Number.isFinite(input.amountRand) || input.amountRand! <= 0 || input.currency !== "ZAR") return;
  const key = `smelt-vercel-purchase-${input.reference}`;
  if (purchases.has(key)) return;
  try { if (sessionStorage.getItem(key)) return; } catch { /* Memory fallback. */ }
  const cart: CartState = { green: 0, cream: 0 };
  for (const item of input.items ?? []) {
    if ((item.colour === "green" || item.colour === "cream") && Number.isInteger(item.qty) && item.qty > 0) {
      cart[item.colour] += item.qty;
    }
  }
  if (!cartCount(cart)) return;
  if (trackVercelEvent("Purchase", vercelCartData(cart, input.amountRand!))) {
    purchases.add(key);
    try { sessionStorage.setItem(key, "1"); } catch { /* Memory fallback. */ }
  }
}
