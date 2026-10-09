"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const purchases = new Set<string>();

/** Call only with the successful server verifier response. */
export function trackGoogleAdsPurchase(input: {
  paid?: boolean;
  reference?: string;
  amountRand?: number;
  currency?: string;
}): void {
  if (typeof window === "undefined" || input.paid !== true ||
      typeof input.reference !== "string" || !input.reference.trim() ||
      typeof input.amountRand !== "number" || !Number.isFinite(input.amountRand) ||
      input.amountRand <= 0 || input.currency !== "ZAR") return;

  const key = `smelt-google-ads-purchase-${input.reference}`;
  const send = () => {
    if (!window.gtag || purchases.has(key)) return;
    try { if (sessionStorage.getItem(key)) return; } catch { /* Memory fallback. */ }
    try {
      window.gtag("event", "conversion", {
        send_to: "AW-18503032708/soqaCOy2w5YdEIS_9_ZE",
        value: input.amountRand,
        currency: "ZAR",
        transaction_id: input.reference,
      });
      purchases.add(key);
      try { sessionStorage.setItem(key, "1"); } catch { /* Memory fallback. */ }
    } catch { /* Tracking must never interrupt payment confirmation. */ }
  };

  if (window.gtag) {
    send();
  } else {
    window.addEventListener("google-ads-ready", send, { once: true });
  }
}
