import { PREORDER_MODE, PREORDER_PRICE, REGULAR_PRICE } from "./salesMode";

export const BASE_PRICE = PREORDER_MODE ? PREORDER_PRICE : REGULAR_PRICE;
export const SHIPPING_FEE = 90;
export const FOUNDERS_DELIVERY_FEE = 5000;
export const SHIPPING_METHODS = ["aramex", "founders"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export const SHIPPING_OPTIONS = {
  aramex: {
    label: "Express shipping",
    description: "Dispatched in 1–3 business days. Transit is 1–3 business days to main centres and 3–5 to regional or outlying areas.",
  },
  founders: {
    label: "Hand delivered by founders",
    description: "Next business day delivery.",
  },
} satisfies Record<ShippingMethod, { label: string; description: string }>;

/** Older payments without a shipping selection used Aramex. Reject unknown methods. */
export function parseShippingMethod(value: unknown): ShippingMethod | null {
  if (value === undefined) return "aramex";
  return value === "aramex" || value === "founders" ? value : null;
}
export const FREE_SHIP_THRESHOLD = 500;
// Record this version in payment metadata. Keep its rules stable for paid orders.
export const PRICING_VERSION = "hat-bundles-v1";
export const THREE_HAT_PRICE = 1250;
export const FOUR_HAT_PRICE = 1600;

/** Apply packs across the whole order, regardless of the colour mix. */
export function bundleSubtotal(qty: number, price = BASE_PRICE): number {
  const packs = Math.floor(qty / 4);
  const remainder = qty % 4;
  return packs * FOUR_HAT_PRICE + (remainder === 3 ? THREE_HAT_PRICE : remainder * price);
}

export function bundleDiscount(qty: number, price = BASE_PRICE): number {
  return qty * price - bundleSubtotal(qty, price);
}

/** Advertised saving includes one standard delivery fee at full item price. */
export function bundleDeliveredSaving(qty: number): number {
  return bundleDiscount(qty) + SHIPPING_FEE;
}

/** Undiscounted single-hat price; pack savings apply to the whole order. */
export function unitPrice(): number {
  return BASE_PRICE;
}

/** Undiscounted line total. Show the bundle discount separately. */
export function lineTotal(qty: number): number {
  return unitPrice() * qty;
}

/** "R1 578" style formatting: integer Rand with space thousands separators. */
export function formatMoney(n: number): string {
  return "R" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function qualifiesForFreeShipping(subtotal: number): boolean {
  return subtotal >= FREE_SHIP_THRESHOLD;
}

export function shippingFee(subtotal: number, method: ShippingMethod = "aramex"): number {
  if (method === "founders") return FOUNDERS_DELIVERY_FEE;
  return qualifiesForFreeShipping(subtotal) ? 0 : SHIPPING_FEE;
}

export function grandTotal(subtotal: number, method: ShippingMethod = "aramex"): number {
  return subtotal + shippingFee(subtotal, method);
}
