"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { COLOURS, PRODUCT } from "@/lib/product";
import { formatMoney, lineTotal, shippingFee, grandTotal, SHIPPING_OPTIONS, type ShippingMethod } from "@/lib/pricing";
import { AddressAutocomplete, type ParsedPlaceAddress } from "@/components/AddressAutocomplete";
import { isCompleteAddress, type ShippingAddress } from "@/lib/address";
import { META_CURRENCY, metaCartContents } from "@/lib/meta";
import { getMetaClientContext, trackMetaEvent } from "@/lib/metaPixel";
import { tiktokCartParameters } from "@/lib/tiktok";
import { getTikTokClientContext, identifyTikTok, trackTikTokEvent } from "@/lib/tiktokPixel";
import { trackVercelEvent, vercelCartData } from "@/lib/vercelAnalytics";
import styles from "./checkout.module.css";
import { useCheckoutFollowup } from "@/lib/useCheckoutFollowup";

type Status = "idle" | "submitting" | "error";
export default function CheckoutPage() {
  const { cart, subtotal } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const checkoutTracked = useRef(false);

  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("aramex");
  const [specialDeliveryOpen, setSpecialDeliveryOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [manualAddress, setManualAddress] = useState(false);
  const [showOptionalAddress, setShowOptionalAddress] = useState(false);
  const [address, setAddress] = useState<ShippingAddress>({
    line1: "",
    suburb: "",
    city: "",
    postalCode: "",
    province: "",
    country: "South Africa",
    phone: "",
    addressLine2: "",
    company: "",
  });
  const setAddr = (k: string, v: string) =>
    setAddress((a) => ({ ...a, [k]: v }));

  const handlePlaceSelect = (parsed: ParsedPlaceAddress) => {
    setAddress((prev) => ({
      ...prev,
      line1: parsed.line1 || prev.line1,
      formattedAddress: parsed.formattedAddress || prev.formattedAddress,
      suburb: parsed.suburb || prev.suburb,
      city: parsed.city || prev.city,
      province: parsed.province || prev.province,
      postalCode: parsed.postalCode || prev.postalCode,
      country: parsed.country || prev.country,
      lat: parsed.lat ?? prev.lat,
      lng: parsed.lng ?? prev.lng,
      placeId: parsed.placeId ?? prev.placeId,
    }));
    setManualAddress(false);
  };
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [followupStage, setFollowupStage] = useState<"details" | "payment_opened" | "payment_closed">("details");
  useCheckoutFollowup({ email, name, cart, activity: address, stage: error ? "checkout_error" : followupStage });
  const trackCheckoutStage = (event: "PaymentOpened" | "CheckoutError") => {
    trackVercelEvent(event, vercelCartData(cart));
  };

  useEffect(() => {
    if (checkoutTracked.current || subtotal <= 0) return;
    checkoutTracked.current = true;
    trackVercelEvent("InitiateCheckout", vercelCartData(cart));
    trackTikTokEvent("InitiateCheckout", tiktokCartParameters(cart, grandTotal(subtotal, shippingMethod)));
    const contents = metaCartContents(cart);
    trackMetaEvent("InitiateCheckout", {
      content_ids: contents.map((item) => item.id),
      contents,
      content_type: "product",
      currency: META_CURRENCY,
      value: grandTotal(subtotal, shippingMethod),
      num_items: contents.reduce((total, item) => total + item.quantity, 0),
    });
  }, [cart, subtotal, shippingMethod]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isCompleteAddress(address)) {
      trackCheckoutStage("CheckoutError");
      setManualAddress(true);
      setError("Please check the street, city, postal code and province for your delivery address.");
      setStatus("error");
      return;
    }

    if (!address.phone?.trim()) {
      trackCheckoutStage("CheckoutError");
      setError("Please enter a contact phone number for your delivery.");
      setStatus("error");
      return;
    }

    identifyTikTok({ email, phone: address.phone });

    // Hand off to Paystack
    setStatus("submitting");
    setFollowupStage("payment_opened");

    // Paystack (and, downstream, the order confirmation email) should get the
    // full formatted address in line1 — paste-ready for Aramex's "Street
    // Address" field — while the checkout form itself keeps showing the
    // customer just the short street line.
    const paystackAddress: ShippingAddress = {
      ...address,
      line1: address.formattedAddress || address.line1,
    };

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          address: paystackAddress,
          cart,
          shippingMethod,
          metaClient: getMetaClientContext(),
          tiktokClient: getTikTokClientContext(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) {
        trackCheckoutStage("CheckoutError");
        setError(data.error || "Could not start secure payment. Please try again.");
        setStatus("error");
        return;
      }
      trackCheckoutStage("PaymentOpened");
      window.location.assign(data.authorizationUrl);
    } catch {
      trackCheckoutStage("CheckoutError");
      setError("Could not open secure payment. Please try again.");
      setStatus("error");
    }
  }

  const totalAmount = grandTotal(subtotal, shippingMethod);
  const addressSummary = [
    address.line1,
    address.addressLine2,
    address.company,
    address.suburb,
    address.city,
    address.postalCode,
    address.province,
  ].filter(Boolean).join(", ");
  const shippingChoice = (method: ShippingMethod) => (
    <label className={styles.shippingOption}>
      <input
        type="radio"
        name="shippingMethod"
        value={method}
        checked={shippingMethod === method}
        onChange={() => {
          setShippingMethod(method);
          setSpecialDeliveryOpen(method === "founders");
        }}
      />
      <span className={styles.shippingDetails}>
        <span className={styles.shippingHeading}>
          <strong>{SHIPPING_OPTIONS[method].label}</strong>
          <span className={styles.shippingPrice}>
            {shippingFee(subtotal, method) === 0 ? "FREE" : formatMoney(shippingFee(subtotal, method))}
          </span>
        </span>
        <span className={styles.shippingDescription}>{SHIPPING_OPTIONS[method].description}</span>
        {method === "aramex" && <span className={styles.shippingDescription}>Free with two or more hats.</span>}
      </span>
    </label>
  );

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.badge}>Checkout</div>

        <h1 className={styles.h1}>Almost warm.</h1>
        <p className={styles.copy}>
          Enter your delivery details and we&rsquo;ll confirm each colour is still
          available before opening secure payment.
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
              <span>{SHIPPING_OPTIONS[shippingMethod].label}</span>
              <span>
                {shippingFee(subtotal, shippingMethod) === 0
                  ? "FREE"
                  : formatMoney(shippingFee(subtotal, shippingMethod))}
              </span>
            </div>
            <div className={styles.total} aria-live="polite" aria-atomic="true">
              <span>Total</span>
              <span>{formatMoney(totalAmount)}</span>
            </div>
          </div>
        ) : (
          <p className={styles.empty}>Your bag is empty. Add a hat first.</p>
        )}

        {lines.length > 0 && (
          <form className={styles.form} onSubmit={handlePay}>
            <fieldset className={styles.shippingOptions} disabled={status === "submitting"}>
              <legend className={styles.label}>Choose your shipping</legend>
              {shippingChoice("aramex")}
              <details className={styles.specialDelivery} open={specialDeliveryOpen} onToggle={(event) => setSpecialDeliveryOpen(event.currentTarget.open)}>
                <summary><span>Special delivery options</span><small>For a particularly warm hand-off</small></summary>
                {shippingChoice("founders")}
              </details>
            </fieldset>
            <label className={styles.field}>
              <span className={styles.label}>Email for your order and checkout support</span>
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
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
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thandi Mokoena"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Street address</span>
              <AddressAutocomplete
                className={styles.input}
                value={address.line1}
                onChange={(value) => setAddress((current) => ({
                  ...current,
                  line1: value,
                  formattedAddress: undefined,
                  suburb: "",
                  city: "",
                  postalCode: "",
                  province: "",
                  lat: undefined,
                  lng: undefined,
                  placeId: undefined,
                }))}
                onPlaceSelect={handlePlaceSelect}
                required
              />
            </label>
            {address.placeId && !manualAddress ? (
              <div className={styles.addressSummary} aria-live="polite">
                <div><span>Delivering to</span><strong>{addressSummary}</strong></div>
                <button type="button" onClick={() => setManualAddress(true)}>Check or edit details</button>
              </div>
            ) : !manualAddress ? (
              <div className={styles.addressHelp}>
                <span>Choose an address from the suggestions to fill the delivery details.</span>
                <button type="button" onClick={() => setManualAddress(true)}>Enter address manually</button>
              </div>
            ) : null}

            {manualAddress && <div className={styles.addressDetails}>
              <div className={styles.addressDetailsHead}>
                <strong>Check your delivery details</strong>
                <button type="button" onClick={() => setManualAddress(false)}>Use address search</button>
              </div>
              <div className={styles.optionalGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Unit, floor or complex <small>Optional</small></span>
                  <input
                    className={styles.input}
                    type="text"
                    autoComplete="address-line2"
                    value={address.addressLine2}
                    onChange={(e) => setAddr("addressLine2", e.target.value)}
                    placeholder="Unit 4, Sauna Heights"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Company or estate <small>Optional</small></span>
                  <input
                    className={styles.input}
                    type="text"
                    name="company"
                    autoComplete="organization"
                    value={address.company ?? ""}
                    onChange={(e) => setAddr("company", e.target.value)}
                    placeholder="Company, park or estate"
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Suburb</span>
                <input
                  className={styles.input}
                  type="text"
                  autoComplete="address-level3"
                  value={address.suburb}
                  onChange={(e) => setAddr("suburb", e.target.value)}
                  placeholder="Sea Point"
                  required
                />
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.label}>City</span>
                  <input
                    className={styles.input}
                    type="text"
                    autoComplete="address-level2"
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
                    autoComplete="postal-code"
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
                  autoComplete="address-level1"
                  value={address.province}
                  onChange={(e) => setAddr("province", e.target.value)}
                  placeholder="Western Cape"
                  required
                />
              </label>
            </div>}

            {!manualAddress && address.placeId && <div className={styles.optionalAddress}>
              <button type="button" onClick={() => setShowOptionalAddress((shown) => !shown)} aria-expanded={showOptionalAddress}>
                {showOptionalAddress ? "Hide optional delivery details" : "+ Add a unit, complex, estate or company"}
              </button>
              {showOptionalAddress && <div className={styles.optionalGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Unit, floor or complex <small>Optional</small></span>
                  <input className={styles.input} type="text" autoComplete="address-line2" value={address.addressLine2} onChange={(e) => setAddr("addressLine2", e.target.value)} placeholder="Unit 4, Sauna Heights" />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Company or estate <small>Optional</small></span>
                  <input className={styles.input} type="text" name="company" autoComplete="organization" value={address.company ?? ""} onChange={(e) => setAddr("company", e.target.value)} placeholder="Company, park or estate" />
                </label>
              </div>}
            </div>}

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
              disabled={status === "submitting"}
            >
              {status === "submitting"
                ? "Starting secure checkout…"
                : `Pay ${formatMoney(totalAmount)} securely`}
            </button>
            <p className={styles.secure}>Card and available secure payment methods powered by Paystack.</p>
          </form>
        )}

        <Link href="/product" className={styles.back}>
          ← Back to shopping
        </Link>
      </div>
    </main>
  );
}
