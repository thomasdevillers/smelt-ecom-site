export const BASE_PRICE = 450;
export const SHIPPING_FEE = 90;
export const FOUNDERS_DELIVERY_FEE = 5000;
export const SHIPPING_METHODS = ["aramex", "founders"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export const SHIPPING_OPTIONS = {
  aramex: {
    label: "Express shipping",
    description: "Overnight to main business centres; 24–72 hours for outlying areas.",
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

/** Every hat has the same price, regardless of quantity or colour. */
export function unitPrice(): number {
  return BASE_PRICE;
}

/** Total for `qty` units of one colour. */
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
