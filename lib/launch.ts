// Founding-batch / pre-launch config. Single source of truth for launch copy.
// We haven't launched yet. The first run is a limited batch sold as pre-orders.

export const LAUNCH = {
  /** We are not selling live stock yet; orders are pre-orders for the first run. */
  preOrder: true,
  /** Batch label shown on badges / ticker, e.g. "Batch 001". */
  batchLabel: "Batch 001",
  /** Size of the founding run. */
  batchSize: 100,
  /** Perk founding-batch buyers get. */
  perk: "a founding-batch care card",
  /** Rough dispatch expectation shown at pre-order/checkout. */
  shipEstimate: "ships in the first batch, est. 4 to 6 weeks",
} as const;
