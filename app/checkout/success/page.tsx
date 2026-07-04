"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/pricing";
import styles from "../checkout.module.css";

type State =
  | { kind: "verifying" }
  | { kind: "paid"; amount: number; reference: string }
  | { kind: "failed"; message: string };

export default function CheckoutSuccessPage() {
  const { dispatch } = useCart();
  const [state, setState] = useState<State>({ kind: "verifying" });
  const cleared = useRef(false);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) {
      setState({ kind: "failed", message: "No payment reference found." });
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/checkout/verify?reference=${encodeURIComponent(reference)}`,
        );
        const data = await res.json();
        if (res.ok && data.paid) {
          // Empty the bag exactly once on a confirmed payment.
          if (!cleared.current) {
            cleared.current = true;
            dispatch({ type: "clear" });
          }
          setState({ kind: "paid", amount: data.amountRand, reference: data.reference });
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
            <h1 className={styles.h1}>You&rsquo;re in the founding batch. Warm regards.</h1>
            <p className={styles.copy}>
              We&rsquo;ve received {formatMoney(state.amount)}. Your hat is
              hand-felted to order and ships with the founding batch, roughly
              four to six weeks out. A receipt is on its way to your inbox.
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
