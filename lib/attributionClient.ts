"use client";

import { activeAttribution, ATTRIBUTION_STORAGE_KEY, captureTouch, mergeAttribution, type OrderAttribution } from "./attribution";

let memory: OrderAttribution | null = null;
let capturedDocument = false;
let lastLocation = "";

function read(now: number) {
  try {
    return activeAttribution(JSON.parse(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "null"), now) || activeAttribution(memory, now);
  } catch { return activeAttribution(memory, now); }
}

/** Storage blocking must never prevent checkout. Keep a same-page fallback in memory. */
export function captureBrowserAttribution(): OrderAttribution | null {
  if (typeof window === "undefined") return null;
  const now = Date.now(), url = new URL(window.location.href);
  const previous = read(now);
  const locationKey = `${url.pathname}${url.search}`;
  // The document referrer describes the initial visit, never internal navigation.
  // On later routes, process only explicit marketing parameters.
  const hasTags = ["utm_source", "gclid", "msclkid", "fbclid"].some(key => url.searchParams.has(key));
  const shouldCapture = lastLocation !== locationKey && (!capturedDocument || hasTags);
  const touch = shouldCapture ? captureTouch(url, capturedDocument ? "" : document.referrer, now) : null;
  memory = mergeAttribution(previous, touch, now);
  capturedDocument = true;
  lastLocation = locationKey;
  try {
    if (memory) window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(memory));
    else window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch { /* Optional analytics cannot block shopping. */ }
  return memory;
}

export function getCheckoutAttribution() {
  return captureBrowserAttribution();
}
