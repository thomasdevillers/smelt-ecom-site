export const BASE_PRICE = 450;
export const SHIPPING_FEE = 90;
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

export function shippingFee(subtotal: number): number {
  return qualifiesForFreeShipping(subtotal) ? 0 : SHIPPING_FEE;
}

export function grandTotal(subtotal: number): number {
  return subtotal + shippingFee(subtotal);
}
