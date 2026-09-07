"use client";

export type TikTokEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo" | "PlaceAnOrder" | "Purchase";
type Identity = Partial<Record<"email" | "phone_number" | "external_id", string>>;
type Pixel = {
  identify: (identity: Identity) => void;
  track: (event: TikTokEvent, parameters: Record<string, unknown>) => void;
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

export function normalizeTikTokPhone(phone: string): string | undefined {
  const cleaned = phone.trim().replace(/[\s().-]/g, "");
  const international = cleaned.startsWith("00") ? `+${cleaned.slice(2)}`
    : /^0\d{9}$/.test(cleaned) ? `+27${cleaned.slice(1)}`
    : /^27\d{9}$/.test(cleaned) ? `+${cleaned}` : cleaned;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : undefined;
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
  void identification.then((identity) => withPixel((pixel) => {
    if (Object.keys(identity).length) pixel.identify(identity);
    pixel.track(event, parameters);
    if (key) {
      try { sessionStorage.setItem(key, "1"); } catch { /* Memory still prevents repeats. */ }
    }
  }));
}

export function trackTikTokPage(): void {
  withPixel((pixel) => pixel.page());
}
