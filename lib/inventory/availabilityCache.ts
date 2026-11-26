import type { Availability } from "./availability";

export type AvailabilitySnapshot = { stock: Availability | null; error: string };
export const emptyAvailability: AvailabilitySnapshot = { stock: null, error: "" };

export function createAvailabilityCache(load: () => Promise<Availability>, now = () => Date.now()) {
  let snapshot = emptyAvailability;
  let updatedAt = 0;
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: AvailabilitySnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seed(stock: Availability) {
      if (!updatedAt && !snapshot.stock) publish({ stock, error: "" });
    },
    refresh(force = true): Promise<void> {
      if (pending) return pending;
      if (!force && updatedAt && now() - updatedAt < 15_000) return Promise.resolve();
      pending = load()
        .then(
          (stock) => {
            updatedAt = now();
            publish({ stock, error: "" });
          },
          () => {
            // Stock must fail closed; don't permit purchases based on stale quantities.
            publish({ stock: null, error: "We couldn’t check availability. Please try again." });
          },
        )
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
