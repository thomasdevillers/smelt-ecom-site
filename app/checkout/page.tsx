"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { COLOURS, PRODUCT } from "@/lib/product";
import { formatMoney, lineTotal } from "@/lib/pricing";
import styles from "./checkout.module.css";

type Status = "idle" | "submitting" | "verifying" | "preorder" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export default function CheckoutPage() {
  const { cart, subtotal, dispatch } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    province: "",
    country: "South Africa",
    phone: "",
  });
  const setAddr = (k: string, v: string) =>
    setAddress((a) => ({ ...a, [k]: v }));
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  function trackCart() {
    if (!EMAIL_RE.test(email) || lines.length === 0) return;
    fetch("/api/cart/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, cart }),
    }).catch(() => {}); // fire-and-forget; never block or surface errors
  }

  // Paystack's own type is missing some props. Rather than augment it, any.
  const onSuccess = async (trx: any) => {
    setStatus("verifying");
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: trx.reference, cart, address, name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        setStatus("error");
        return;
      }

      // Successful payment + order logged.
      dispatch({ type: "clear" });
      router.push("/checkout/success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  };

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (process.env.NEXT_PUBLIC_PAYSTACK_CONFIGURED !== "true") {
      // Payments not live yet: fall back to pre-order confirmation.
      setStatus("preorder");
      return;
    }

    // Hand off to Paystack
    setStatus("submitting");

    const items = COLOURS.filter((c) => cart[c] > 0).map((c) => ({
      colour: c,
      name: PRODUCT.variants[c].name,
      qty: cart[c],
    }));

    // Dynamically import PaystackPop to prevent window is not defined error during SSR
    const PaystackPop = (await import("@paystack/inline-js")).default;
    const paystack = new PaystackPop();
    paystack.newTransaction({
      key: PAYSTACK_KEY!,
      email,
      amount: Math.round(subtotal * 100),
      currency: "ZAR",
      metadata: {
        custom_fields: [
          {
            display_name: "Cart",
            variable_name: "cart",
            value: JSON.stringify(cart),
          },
          {
            display_name: "Items",
            variable_name: "items",
            value: JSON.stringify(items),
          },
          {
            display_name: "Amount (ZAR)",
            variable_name: "amount_rand",
            value: subtotal,
          },
          {
            display_name: "Customer Name",
            variable_name: "customer_name",
            value: name,
          },
          {
            display_name: "Shipping Address",
            variable_name: "shipping_address",
            value: JSON.stringify(address),
          },
        ],
      },
      onSuccess,
      onCancel: () => {
        setStatus("idle");
      },
    });
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
                onBlur={trackCart}
                placeholder="you@example.com"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Full name</span>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thandi Mokoena"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Address line 1</span>
              <input
                className={styles.input}
                type="text"
                value={address.line1}
                onChange={(e) => setAddr("line1", e.target.value)}
                placeholder="12 Loop Street"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Address line 2 (optional)</span>
              <input
                className={styles.input}
                type="text"
                value={address.line2}
                onChange={(e) => setAddr("line2", e.target.value)}
                placeholder="Apartment, suite, etc."
              />
            </label>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.label}>City</span>
                <input
                  className={styles.input}
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddr("city", e.target.value)}
                  placeholder="Cape Town"
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Postal code</span>
                <input
                  className={styles.input}
                  type="text"
                  value={address.postalCode}
                  onChange={(e) => setAddr("postalCode", e.target.value)}
                  placeholder="8001"
                  required
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Province</span>
              <input
                className={styles.input}
                type="text"
                value={address.province}
                onChange={(e) => setAddr("province", e.target.value)}
                placeholder="Western Cape"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Country</span>
              <input
                className={styles.input}
                type="text"
                value={address.country}
                onChange={(e) => setAddr("country", e.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Phone (optional)</span>
              <input
                className={styles.input}
                type="tel"
                value={address.phone}
                onChange={(e) => setAddr("phone", e.target.value)}
                placeholder="+27 82 000 0000"
              />
            </label>
            {status === "error" && <p className={styles.err}>{error}</p>}
            <button
              className={styles.pay}
              type="submit"
              disabled={status === "submitting" || status === "verifying"}
            >
              {status === "submitting"
                ? "Starting secure checkout…"
                : status === "verifying"
                  ? "Verifying payment…"
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
