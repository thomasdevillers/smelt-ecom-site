// Manual storefront switch. See docs/preorder-switch.md before changing it.
export const PREORDER_MODE = true;
export const PREORDER_PRICE = 450;
export const REGULAR_PRICE = 550;
export const PREORDER_DEADLINE = '2026-10-15T12:00:00+02:00';
export const PREORDER_DATE_LABEL = '15 October 2026';
export const PREORDER_COPY = 'Expected 15 October. Delivery follows arrival.';

export function countdownParts(now: number) {
  const seconds = Math.max(0, Math.floor((Date.parse(PREORDER_DEADLINE) - now) / 1000));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
}
