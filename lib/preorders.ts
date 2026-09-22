import type { CartState } from './cartReducer';

export const PREORDER_BATCH = '2026-10-22';
export const PREORDER_ARRIVAL = '22 October 2026';
export const PREORDER_TIMING = 'Shipment expected around 22 October 2026. Dispatch within 1–3 business days after arrival.';
export interface PreorderDetails { batch: string; arrival: string; quantities: CartState }
export interface Availability extends CartState { preorder: CartState; batch: string; timing: string; localTest: boolean }
export function preorderQuantities(cart: CartState, stock: CartState): CartState {
  return { green: Math.max(0, cart.green - stock.green), cream: Math.max(0, cart.cream - stock.cream) };
}
export function hasPreorder(cart: CartState) { return cart.green > 0 || cart.cream > 0; }
export function parsePreorder(value: unknown): PreorderDetails | undefined {
  if (!value || typeof value !== 'object') return;
  const d = value as PreorderDetails;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.batch) || typeof d.arrival !== 'string' || d.arrival.length > 80 || !d.quantities) return;
  if (![d.quantities.green, d.quantities.cream].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 99) || !hasPreorder(d.quantities)) return;
  return { batch: d.batch, arrival: d.arrival, quantities: { green: d.quantities.green, cream: d.quantities.cream } };
}
export function preorderTiming(details: PreorderDetails) {
  return `Shipment expected around ${details.arrival}. Your entire order will dispatch together within 1–3 business days after arrival.`;
}
