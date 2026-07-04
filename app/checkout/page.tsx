"use client";
import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { COLOURS, PRODUCT } from "@/lib/product";
import { formatMoney, lineTotal } from "@/lib/pricing";
import styles from "./checkout.module.css";

type Status = "idle" | "submitting" | "preorder" | "error";

export default function CheckoutPage() {
  const { cart, subtotal } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, cart }),
      });
      const data = await res.json();

      if (res.status === 503 && data.configured === false) {
        // Payments not live yet: fall back to pre-order confirmation.
        setStatus("preorder");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      // Hand off to Paystack's hosted checkout.
      window.location.href = data.authorizationUrl;
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.badge}>Checkout</div>

        {status === "preorder" ? (
          <>
            <h1 className={styles.h1}>You&rsquo;re on the list. Warm regards.</h1>
            <p className={styles.copy}>
              Card payments aren&rsquo;t live just yet, but we&rsquo;ve noted your
              pre-order at <strong>{email}</strong>. We&rsquo;ll email you the
              moment the founding batch is ready to pay for and ship.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.h1}>Almost warm.</h1>
            <p className={styles.copy}>
              Enter your email and pay securely. Everything is hand-felted to
              order, so your pre-order ships with the founding batch.
            </p>
          </>
        )}

        {lines.length > 0 ? (
          <div className={styles.summary}>
            {lines.map((c) => (
              <div key={c} className={styles.row}>
                <span>
                  {PRODUCT.variants[c].name} × {cart[c]}
                </span>
                <span>{formatMoney(lineTotal(cart[c]))}</span>
              </div>
            ))}
            <div className={styles.total}>
              <span>Total</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>Your bag is empty. Add a hat first.</p>
        )}

        {status !== "preorder" && lines.length > 0 && (
          <form className={styles.form} onSubmit={handlePay}>
            <label className={styles.field}>
              <span className={styles.label}>Email for your receipt</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            {status === "error" && <p className={styles.err}>{error}</p>}
            <button
              className={styles.pay}
              type="submit"
              disabled={status === "submitting"}
            >
              {status === "submitting"
                ? "Starting secure checkout…"
                : `Pay ${formatMoney(subtotal)} securely`}
            </button>
            <p className={styles.secure}>Payments secured by Paystack.</p>
          </form>
        )}

        <Link href="/product" className={styles.back}>
          ← Back to shopping
        </Link>
      </div>
    </main>
  );
}
