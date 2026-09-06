"use client";

import type { MetaClientContext } from "./meta";

type MetaEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackMetaEvent(
  eventName: MetaEventName,
  parameters?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;

  const send = () => {
    if (!window.fbq) return;
    if (eventId) {
      window.fbq("track", eventName, parameters ?? {}, { eventID: eventId });
      return;
    }
    window.fbq("track", eventName, parameters ?? {});
  };

  if (window.fbq) {
    send();
  } else {
    window.addEventListener("meta-pixel-ready", send, { once: true });
  }
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function getMetaClientContext(): MetaClientContext {
  if (typeof window === "undefined") return {};
  return {
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc"),
    clientUserAgent: navigator.userAgent,
  };
}
