"use client";
import { useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import type { Availability } from "./availability";
import { createAvailabilityCache, emptyAvailability } from "./availabilityCache";

const cache = createAvailabilityCache(async () => {
  const response = await fetch("/api/inventory", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Inventory unavailable");
  const data = await response.json();
  if (
    !data ||
    ![data.green, data.cream, data.preorder?.green, data.preorder?.cream].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new Error("Invalid inventory");
  return data as Availability;
});
let consumers = 0;
let stopPolling: (() => void) | undefined;
const refresh = () => cache.refresh();

function subscribe(listener: () => void) {
  const unsubscribe = cache.subscribe(listener);
  if (++consumers === 1) {
    const refreshVisible = () => {
      if (document.visibilityState !== "hidden") void cache.refresh(false);
    };
    const interval = setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    queueMicrotask(refreshVisible);
    stopPolling = () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }
  return () => {
    unsubscribe();
    if (--consumers === 0) stopPolling?.();
  };
}

export function useAvailability(initialStock: Availability | null = null, enabled = true) {
  const initial = useMemo(
    () => (initialStock ? { stock: initialStock, error: "" } : emptyAvailability),
    [initialStock],
  );
  const listen = useCallback(
    (listener: () => void) => (enabled ? subscribe(listener) : () => {}),
    [enabled],
  );
  const snapshot = useSyncExternalStore(listen, cache.getSnapshot, () => initial);
  useEffect(() => {
    if (enabled && initialStock) cache.seed(initialStock);
  }, [enabled, initialStock]);
  return { ...snapshot, refresh };
}
