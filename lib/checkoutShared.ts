import { type CartState } from "@/lib/cartReducer";

// Never trust a total sent from the browser. We only accept the cart quantities
// and recompute the amount server-side with the same pricing logic the UI uses.
export function sanitizeCart(input: unknown): CartState {
  const c = (input ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown) =>
    Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));
  return { green: clamp(c.green), cream: clamp(c.cream) };
}
