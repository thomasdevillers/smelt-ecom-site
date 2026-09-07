"use client";

import { normalizeTikTokPhone, type TikTokClientContext } from "./tiktok";
export { normalizeTikTokPhone } from "./tiktok";

export type TikTokEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo" | "PlaceAnOrder" | "Purchase";
type Identity = Partial<Record<"email" | "phone_number" | "external_id", string>>;
type Pixel = {
  identify: (identity: Identity) => void;
  track: (event: TikTokEvent, parameters: Record<string, unknown>, options?: { event_id: string }) => void;
  page: () => void;
};

declare global {
  interface Window { ttq?: Pixel }
}

let identification: Promise<Identity> = Promise.resolve({});
const sent = new Set<string>();

function withPixel(send: (pixel: Pixel) => void): void {
  if (typeof window === "undefined") return;
  const run = () => {
    try { if (window.ttq) send(window.ttq); } catch { /* Analytics must not interrupt checkout. */ }
  };
  if (window.ttq) run();
  else window.addEventListener("tiktok-pixel-ready", run, { once: true });
}

export async function hashTikTokIdentity(input: { email?: string; phone?: string; externalId?: string }): Promise<Identity> {
  // No plaintext fallback on insecure browsers or when hashing fails.
  if (!globalThis.crypto?.subtle) return {};
  const values = {
    email: input.email?.trim().toLowerCase(),
    phone_number: input.phone ? normalizeTikTokPhone(input.phone) : undefined,
    external_id: input.externalId?.trim(),
  };
  try {
    const entries = await Promise.all(Object.entries(values).filter(([, value]) => value).map(async ([key, value]) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value!));
      return [key, Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")];
    }));
    return Object.fromEntries(entries);
  } catch { return {}; }
}

export function identifyTikTok(input: { email?: string; phone?: string; externalId?: string }): void {
  identification = hashTikTokIdentity(input);
}

export function trackTikTokEvent(event: TikTokEvent, parameters: Record<string, unknown>, eventId?: string): void {
  if (typeof window === "undefined") return;
  const key = eventId ? `smelt-tiktok-${event}-${eventId}` : undefined;
  if (key) {
    if (sent.has(key)) return;
    try { if (sessionStorage.getItem(key)) return; } catch { /* Use memory if storage is blocked. */ }
    sent.add(key);
  }
  const sharedId = eventId ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const context = getTikTokClientContext();
  const url = `${window.location?.origin ?? ""}${window.location?.pathname ?? "/"}`;
  void identification.then((identity) => {
    // The browser relay only handles browsing actions. Payments originate on the server.
    if (["ViewContent", "AddToCart", "InitiateCheckout"].includes(event)) {
      try {
        void fetch("/api/tiktok/events", {
          method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
          body: JSON.stringify({ event, event_id: sharedId, parameters, url, user: {
            ...context, email: identity.email, phone: identity.phone_number, external_id: identity.external_id,
          } }),
        }).catch(() => {});
      } catch { /* A blocked relay must not prevent the pixel. */ }
    }
    withPixel((pixel) => {
      if (Object.keys(identity).length) pixel.identify(identity);
      pixel.track(event, parameters, { event_id: sharedId });
      if (key) {
        try { sessionStorage.setItem(key, "1"); } catch { /* Memory still prevents repeats. */ }
      }
    });
  });
}

export function trackTikTokPage(): void {
  withPixel((pixel) => pixel.page());
}

export function getTikTokClientContext(): TikTokClientContext {
  if (typeof window === "undefined") return {};
  let ttclid: string | undefined;
  let ttp: string | undefined;
  try {
    ttclid = new URLSearchParams(window.location.search).get("ttclid") || undefined;
    if (ttclid) sessionStorage.setItem("smelt-ttclid", ttclid);
    else ttclid = sessionStorage.getItem("smelt-ttclid") || undefined;
  } catch { /* Optional attribution. */ }
  try {
    ttp = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("_ttp="))?.slice(5);
  } catch { /* Cookies may be unavailable. */ }
  return { ttclid, ttp, user_agent: typeof navigator === "undefined" ? undefined : navigator.userAgent };
}
