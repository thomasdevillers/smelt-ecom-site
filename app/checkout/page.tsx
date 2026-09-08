"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { COLOURS, PRODUCT } from "@/lib/product";
import { formatMoney, lineTotal, shippingFee, grandTotal } from "@/lib/pricing";
import { AddressAutocomplete, type ParsedPlaceAddress } from "@/components/AddressAutocomplete";
import type { ShippingAddress } from "@/lib/address";
import { META_CURRENCY, metaCartContents } from "@/lib/meta";
import { getMetaClientContext, trackMetaEvent } from "@/lib/metaPixel";
import { tiktokCartParameters } from "@/lib/tiktok";
import { getTikTokClientContext, identifyTikTok, trackTikTokEvent } from "@/lib/tiktokPixel";
import { trackVercelEvent, vercelCartData } from "@/lib/vercelAnalytics";
import styles from "./checkout.module.css";
import { useCheckoutFollowup } from "@/lib/useCheckoutFollowup";

type Status = "idle" | "submitting" | "verifying" | "error";
type PaystackSuccess = { reference: string };

const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export default function CheckoutPage() {
  const { cart, subtotal, dispatch } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const router = useRouter();
  const checkoutTracked = useRef(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState<ShippingAddress>({
    line1: "",
    line2: "",
    buildingName: "",
    city: "",
    postalCode: "",
    province: "",
    country: "South Africa",
    phone: "",
  });
  const setAddr = (k: string, v: string) =>
    setAddress((a) => ({ ...a, [k]: v }));

  const handlePlaceSelect = (parsed: ParsedPlaceAddress) => {
    setAddress((prev) => ({
      ...prev,
      line1: parsed.line1 || prev.line1,
      line2: parsed.line2 || prev.line2,
      city: parsed.city || prev.city,
      province: parsed.province || prev.province,
      postalCode: parsed.postalCode || prev.postalCode,
      country: parsed.country || prev.country,
      lat: parsed.lat ?? prev.lat,
      lng: parsed.lng ?? prev.lng,
      placeId: parsed.placeId ?? prev.placeId,
    }));
  };
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [followupStage, setFollowupStage] = useState<"details" | "payment_opened" | "payment_closed">("details");
  useCheckoutFollowup({ email, name, cart, activity: address, stage: error ? "checkout_error" : followupStage });

  useEffect(() => {
    if (checkoutTracked.current || subtotal <= 0) return;
    checkoutTracked.current = true;
    trackVercelEvent("InitiateCheckout", vercelCartData(cart, grandTotal(subtotal)));
    trackTikTokEvent("InitiateCheckout", tiktokCartParameters(cart, grandTotal(subtotal)));
    const contents = metaCartContents(cart);
    trackMetaEvent("InitiateCheckout", {
      content_ids: contents.map((item) => item.id),
      contents,
      content_type: "product",
      currency: META_CURRENCY,
      value: grandTotal(subtotal),
      num_items: contents.reduce((total, item) => total + item.quantity, 0),
    });
  }, [cart, subtotal]);

  const onSuccess = async (trx: PaystackSuccess) => {
    setStatus("verifying");
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: trx.reference,
          cart,
          address,
          name,
          metaClient: getMetaClientContext(),
          tiktokClient: getTikTokClientContext(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        setStatus("error");
        return;
      }

      // Successful payment confirmed by Paystack.
      dispatch({ type: "clear" });
      router.push(
        `/checkout/success?reference=${encodeURIComponent(trx.reference)}`,
      );
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  };

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!address.phone?.trim()) {
      setError("Please enter a contact phone number for your delivery.");
      setStatus("error");
      return;
    }

    if (process.env.NEXT_PUBLIC_PAYSTACK_CONFIGURED !== "true") {
      setError("Checkout is temporarily unavailable. Please try again shortly.");
      setStatus("error");
      return;
    }

    identifyTikTok({ email, phone: address.phone });

    // Hand off to Paystack
    setStatus("submitting");
    setFollowupStage("payment_opened");

    const items = COLOURS.filter((c) => cart[c] > 0).map((c) => ({
      colour: c,
      name: PRODUCT.variants[c].name,
      qty: cart[c],
    }));

    const totalAmount = grandTotal(subtotal);

    // Dynamically import PaystackPop to prevent window is not defined error during SSR
    const PaystackPop = (await import("@paystack/inline-js")).default;
    const paystack = new PaystackPop();
    await paystack.checkout({
      key: PAYSTACK_KEY!,
      email,
      amount: Math.round(totalAmount * 100),
      currency: "ZAR",
      channels: ["card", "apple_pay"],
      // @paystack/inline-js's shipped types only declare `custom_fields` here
      // (its module uses `export =`, which can't be augmented). The flat
      // fields below are what our server actually reads back (see
      // app/api/checkout/verify and app/api/paystack/webhook); custom_fields
      // is purely for Paystack's own dashboard/receipt display.
      metadata: {
        cart,
        items,
        amountRand: totalAmount,
        customerName: name,
        shippingAddress: address,
        metaClient: getMetaClientContext(),
        tiktokClient: getTikTokClientContext(),
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
            value: totalAmount,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      onSuccess,
      onCancel: () => {
        setStatus("idle");
        setFollowupStage("payment_closed");
      },
    });
  }

  const totalAmount = grandTotal(subtotal);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.badge}>Checkout</div>

        <h1 className={styles.h1}>Almost warm.</h1>
        <p className={styles.copy}>
          Your hat is in stock. Enter your delivery details and pay securely,
          and we&rsquo;ll send tracking as soon as it&rsquo;s on the way.
        </p>

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
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className={styles.row}>
              <span>Shipping</span>
              <span>
                {shippingFee(subtotal) === 0
                  ? "FREE"
                  : formatMoney(shippingFee(subtotal))}
              </span>
            </div>
            <div className={styles.total}>
              <span>Total</span>
              <span>{formatMoney(totalAmount)}</span>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>Your bag is empty. Add a hat first.</p>
        )}

        {lines.length > 0 && (
          <form className={styles.form} onSubmit={handlePay}>
            <label className={styles.field}>
              <span className={styles.label}>Email for your order and checkout support</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <AddressAutocomplete
                className={styles.input}
                value={address.line1}
                onChange={(v) => setAddr("line1", v)}
                onPlaceSelect={handlePlaceSelect}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Building / estate name (optional)</span>
              <input
                className={styles.input}
                type="text"
                name="buildingName"
                value={address.buildingName ?? ""}
                onChange={(e) => setAddr("buildingName", e.target.value)}
                placeholder="Building, complex or estate name"
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
              <span className={styles.label}>Contact phone number</span>
              <input
                className={styles.input}
                type="tel"
                name="phone"
                autoComplete="tel"
                value={address.phone}
                onChange={(e) => setAddr("phone", e.target.value)}
                placeholder="+27 82 000 0000"
                required
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
                  : `Pay ${formatMoney(totalAmount)} securely`}
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
