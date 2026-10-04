import { cartSubtotal, type CartState } from "./cartReducer";
import { bundleSubtotal, grandTotal, parseShippingMethod, PRICING_VERSION } from "./pricing";

// Never trust a total sent from the browser. We only accept the cart quantities
// and recompute the amount server-side with the same pricing logic the UI uses.
export function sanitizeCart(input: unknown): CartState {
  const c = (input ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown) =>
    Math.max(0, Math.min(99, Math.floor(Number(v) || 0)));
  return { green: clamp(c.green), cream: clamp(c.cream) };
}

/** Recompute the complete amount Paystack should charge, including shipping. */
export function checkoutTotal(cart: CartState, shippingMethod?: unknown): number {
  const method = parseShippingMethod(shippingMethod);
  if (!method) return Number.NaN;
  const subtotal = cartSubtotal(cart);
  return subtotal > 0 ? grandTotal(subtotal, method) : 0;
}

export function discountedCheckoutTotal(cart: CartState, shippingMethod: unknown, discount = 0): number {
  const total = checkoutTotal(cart, shippingMethod);
  if (!Number.isFinite(total) || !Number.isSafeInteger(discount) || discount < 0 || discount >= total) return Number.NaN;
  return total - discount;
}

/** Only use with metadata fetched from Paystack or its authenticated webhook.
 * Older transactions predate price snapshots and were R450 per hat.
 */
export function paidUnitPrice(value: unknown): number {
  return value === undefined ? 450 : value === 450 || value === 550 ? value : Number.NaN;
}

export function paidCheckoutTotal(cart: CartState, shippingMethod: unknown, discount = 0, price?: unknown, pricingVersion?: unknown): number {
  const method = parseShippingMethod(shippingMethod);
  if (pricingVersion !== undefined && pricingVersion !== PRICING_VERSION) return Number.NaN;
  const unit = paidUnitPrice(price);
  if (!Number.isFinite(unit)) return Number.NaN;
  const qty = cart.green + cart.cream;
  const subtotal = pricingVersion === PRICING_VERSION ? bundleSubtotal(qty, unit) : qty * unit;
  if (!method || !Number.isFinite(subtotal) || subtotal <= 0) return Number.NaN;
  const total = grandTotal(subtotal, method);
  return Number.isSafeInteger(discount) && discount >= 0 && discount < total ? total - discount : Number.NaN;
}
