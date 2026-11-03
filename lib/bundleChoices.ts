import type { CartState } from "./cartReducer";
import type { Availability } from "./preorders";

export type PurchaseQuantity = 1 | 2 | 3 | 4;
export const PURCHASE_QUANTITIES: PurchaseQuantity[] = [1, 2, 3, 4];
export const BUNDLE_GREEN_COUNTS = {
  2: [1, 2, 0],
  3: [2, 1, 3, 0],
  4: [2, 3, 1, 4, 0],
} as const;

export function bundleChoiceLabel(green: number, quantity: number): string {
  const cream = quantity - green;
  if (quantity === 2) return green === 1 ? "One of each" : green === 2 ? "Two green" : "Two cream";
  if (!cream) return `${green} green`;
  if (!green) return `${cream} cream`;
  return `${green} green + ${cream} cream`;
}

/** Include hats already in the bag when checking the selected mix. */
export function canAddSelection(selection: CartState, cart: CartState, stock: Availability): boolean {
  return stock.green + stock.preorder.green >= cart.green + selection.green &&
    stock.cream + stock.preorder.cream >= cart.cream + selection.cream;
}
