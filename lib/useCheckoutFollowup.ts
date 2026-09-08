"use client";

import { useEffect, useRef } from "react";
import type { CartState } from "./cartReducer";

/** Best-effort capture; availability never blocks the customer's payment. */
export function useCheckoutFollowup(input: {
  email: string; name: string; cart: CartState; activity: unknown;
  stage: "details" | "payment_opened" | "payment_closed" | "checkout_error";
}) {
  const id = useRef<string | null>(null);
  const { email, name, cart, activity, stage } = input;
  useEffect(() => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || cart.green + cart.cream <= 0) return;
    if (!id.current) {
      try { id.current = sessionStorage.getItem("smelt-checkout-followup"); } catch { /* Private storage may be disabled. */ }
      if (!id.current) {
        if (!globalThis.crypto?.randomUUID) return;
        id.current = crypto.randomUUID();
        try { sessionStorage.setItem("smelt-checkout-followup", id.current); } catch { /* The in-memory ID still works. */ }
      }
    }
    let sent = false;
    const save = () => {
      if (sent) return;
      sent = true;
      void fetch("/api/checkout/followup", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ id: id.current, email, name, cart, stage }),
      }).then((response) => { if (!response.ok) sent = false; }).catch(() => { sent = false; });
    };
    const timer = setTimeout(save, 1000);
    const hide = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [email, name, cart, activity, stage]);
}
