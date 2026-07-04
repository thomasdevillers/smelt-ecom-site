export const BASE_PRICE = 549;
export const FREE_SHIP_THRESHOLD = 1000;

/** Discount rate applied per-unit based on quantity of a single colour. */
function discountRate(qty: number): number {
  if (qty >= 3) return 0.1;
  if (qty === 2) return 0.05;
  return 0;
}

/** Per-unit price (rounded to whole Rand) for a given quantity of one colour. */
export function unitPrice(qty: number): number {
  return Math.round(BASE_PRICE * (1 - discountRate(qty)));
}

/** Total for `qty` units of one colour. */
export function lineTotal(qty: number): number {
  return unitPrice(qty) * qty;
}

/** "R1 578" style formatting: integer Rand with space thousands separators. */
export function formatMoney(n: number): string {
  return "R" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function qualifiesForFreeShipping(subtotal: number): boolean {
  return subtotal > FREE_SHIP_THRESHOLD;
}
