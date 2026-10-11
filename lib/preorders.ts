import { PREORDER_DATE_LABEL, PREORDER_COPY } from './salesMode';

import type { CartState } from './cartReducer';

// Stable storage identity: do not rename when the estimated arrival changes.
export const PREORDER_BATCH = '2026-10-22';
export const PREORDER_ARRIVAL = PREORDER_DATE_LABEL;
export const PREORDER_TIMING = PREORDER_COPY;
// Keep the legacy date field for stored orders; new orders explicitly record dispatch timing.
export interface PreorderDetails { batch: string; arrival: string; timing?: 'dispatch'; quantities: CartState }
export interface Availability extends CartState { preorder: CartState; batch: string; timing: string; localTest: boolean }
export function preorderQuantities(cart: CartState, stock: CartState): CartState {
  return { green: Math.max(0, cart.green - stock.green), cream: Math.max(0, cart.cream - stock.cream) };
}
export function hasPreorder(cart: CartState) { return cart.green > 0 || cart.cream > 0; }
export function parsePreorder(value: unknown): PreorderDetails | undefined {
  if (!value || typeof value !== 'object') return;
  const d = value as PreorderDetails;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.batch) || typeof d.arrival !== 'string' || d.arrival.length > 80 || !d.quantities) return;
  if (d.timing !== undefined && d.timing !== 'dispatch') return;
  if (![d.quantities.green, d.quantities.cream].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 99) || !hasPreorder(d.quantities)) return;
  return { batch: d.batch, arrival: d.arrival, ...(d.timing ? { timing: d.timing } : {}), quantities: { green: d.quantities.green, cream: d.quantities.cream } };
}
export function preorderTiming(details: PreorderDetails) {
  if (details.timing === 'dispatch') return `Your pre-order ships on ${details.arrival}. Your entire order will ship together. Courier transit starts after dispatch.`;
  return `Expected ${details.arrival}. Delivery follows arrival. Your entire order will ship together.`;
}
