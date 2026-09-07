"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/pricing";
import { META_CURRENCY, metaContentId } from "@/lib/meta";
import { trackMetaEvent } from "@/lib/metaPixel";
import { COLOURS, type Colour } from "@/lib/product";
import { tiktokContent } from "@/lib/tiktok";
import { trackTikTokEvent } from "@/lib/tiktokPixel";
import styles from "../checkout.module.css";

interface PaidItem {
  colour: string;
  qty: number;
}

type State =
  | { kind: "verifying" }
  | { kind: "paid"; amount: number; reference: string; items: PaidItem[] }
  | { kind: "failed"; message: string };

export default function CheckoutSuccessPage() {
  const { dispatch } = useCart();
  const [state, setState] = useState<State>({ kind: "verifying" });
  const cleared = useRef(false);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) {
      queueMicrotask(() =>
        setState({ kind: "failed", message: "No payment reference found." }),
      );
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/checkout/verify?reference=${encodeURIComponent(reference)}`,
        );
        const data = await res.json();
        if (res.ok && data.paid) {
          const tiktokParameters = {
            contents: ((data.items ?? []) as PaidItem[])
              .filter((item) => COLOURS.includes(item.colour as Colour) && item.qty > 0)
              .map((item) => tiktokContent(item.colour as Colour, item.qty)),
            value: data.amountRand,
            currency: data.currency || "ZAR",
          };
          // Paystack owns payment entry; a verified payment is our reliable signal.
          trackTikTokEvent("AddPaymentInfo", tiktokParameters, data.reference);
          trackTikTokEvent("PlaceAnOrder", tiktokParameters, data.reference);
          trackTikTokEvent("Purchase", tiktokParameters, data.reference);
          const purchaseStorageKey = `smelt-meta-purchase-${data.reference}`;
          if (!sessionStorage.getItem(purchaseStorageKey)) {
            const items = (data.items ?? []) as PaidItem[];
            trackMetaEvent(
              "Purchase",
              {
                content_ids: items.map((item) => metaContentId(item.colour)),
                contents: items.map((item) => ({
                  id: metaContentId(item.colour),
                  quantity: item.qty,
                })),
                content_type: "product",
                currency: data.currency || META_CURRENCY,
                value: data.amountRand,
                num_items: items.reduce((total, item) => total + item.qty, 0),
              },
              data.reference,
            );
            sessionStorage.setItem(purchaseStorageKey, "1");
          }
          // Empty the bag exactly once on a confirmed payment.
          if (!cleared.current) {
            cleared.current = true;
            dispatch({ type: "clear" });
          }
          setState({
            kind: "paid",
            amount: data.amountRand,
            reference: data.reference,
            items: data.items ?? [],
          });
        } else {
          setState({
            kind: "failed",
            message:
              data.error || "We couldn't confirm this payment. If you were charged, email us and we'll sort it out.",
          });
        }
      } catch {
        setState({ kind: "failed", message: "We couldn't reach the payment verifier." });
      }
    })();
  }, [dispatch]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {state.kind === "verifying" && (
          <>
            <div className={styles.badge}>One moment</div>
            <h1 className={styles.h1}>Confirming your payment…</h1>
            <p className={styles.copy}>Hang tight while we check with Paystack.</p>
          </>
        )}

        {state.kind === "paid" && (
          <>
            <div className={styles.badge}>Payment confirmed</div>
            <h1 className={styles.h1}>Your order is confirmed. Warm regards.</h1>
            <p className={styles.copy}>
              We&rsquo;ve received {formatMoney(state.amount)}. Your hat is in stock,
              and we&rsquo;ll email tracking as soon as it&rsquo;s on the way. A receipt is
              heading to your inbox now.
            </p>
            <div className={styles.summary}>
              <div className={styles.row}>
                <span>Reference</span>
                <span>{state.reference}</span>
              </div>
            </div>
          </>
        )}

        {state.kind === "failed" && (
          <>
            <div className={styles.badge}>Hmm</div>
            <h1 className={styles.h1}>We couldn&rsquo;t confirm that.</h1>
            <p className={styles.copy}>{state.message}</p>
          </>
        )}

        <Link href="/product" className={styles.back}>
          ← Back to shopping
        </Link>
      </div>
    </main>
  );
}
