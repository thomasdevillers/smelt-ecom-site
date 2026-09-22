"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ProductGallery from "@/components/ProductGallery";
import Accordion from "@/components/Accordion";
import HairPSA from "@/components/HairPSA";
import ProductReviews from "@/components/ProductReviews";
import { POLICIES } from "@/content/policies";
import SectionLabel from "@/components/ui/SectionLabel";
import { PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, SHIPPING_FEE, formatMoney, lineTotal } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import { META_CURRENCY, metaVariantContent } from "@/lib/meta";
import { trackMetaEvent } from "@/lib/metaPixel";
import { tiktokContent } from "@/lib/tiktok";
import { trackTikTokEvent } from "@/lib/tiktokPixel";
import { trackVercelEvent, vercelProductData } from "@/lib/vercelAnalytics";
import styles from "@/app/product/product.module.css";
import type { InventorySnapshot } from "@/lib/inventory";

type PurchaseOption = "single" | "bundle";
type BundleMix = "mixed" | "green" | "cream";

export default function ProductClient() {
  const viewed = useRef(false);
  const [colour, setColour] = useState<Colour>("green");
  const [purchaseOption, setPurchaseOption] = useState<PurchaseOption>("single");
  const [bundleMix, setBundleMix] = useState<BundleMix>("mixed");
  const [stock, setStock] = useState<InventorySnapshot | null>(null);
  const { cart, dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];
  const quantity = purchaseOption === "bundle" ? 2 : 1;
  const total = lineTotal(quantity);
  const selectionLabel = purchaseOption === "single"
    ? v.name
    : bundleMix === "mixed"
      ? "One of each"
      : `Two ${PRODUCT.variants[bundleMix].name}`;
  const selectionInStock = stock !== null && (purchaseOption === "single"
    ? stock[colour] >= cart[colour] + 1
    : bundleMix === "mixed"
      ? stock.green >= cart.green + 1 && stock.cream >= cart.cream + 1
      : stock[bundleMix] >= cart[bundleMix] + 2);
  const add = () => {
    if (!selectionInStock) return;
    if (purchaseOption === "single") {
      dispatch({ type: "add", colour, qty: 1 });
    } else if (bundleMix === "mixed") {
      dispatch({ type: "add", colour: "green", qty: 1 });
      dispatch({ type: "add", colour: "cream", qty: 1 });
    } else {
      dispatch({ type: "add", colour: bundleMix, qty: 2 });
    }
    openCart();
  };
  const bundleAvailable = (value: BundleMix) => stock === null || (value === "mixed"
    ? stock.green >= cart.green + 1 && stock.cream >= cart.cream + 1
    : stock[value] >= cart[value] + 2);
  const unavailableLabel = purchaseOption === "single" && stock?.[colour] === 0
    ? "Out of stock"
    : "Not enough stock";

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackVercelEvent("ViewContent", vercelProductData("green", 1));
    trackTikTokEvent("ViewContent", { contents: [tiktokContent("green", 1)], value: BASE_PRICE, currency: "ZAR" });
    const content = metaVariantContent("green", 1);
    trackMetaEvent("ViewContent", {
      content_name: PRODUCT.name,
      content_ids: [content.id],
      contents: [content],
      content_type: "product",
      currency: META_CURRENCY,
      value: BASE_PRICE,
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/inventory", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((value) => { if (active && value) setStock(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        <ProductGallery colour={colour} />

        <div className={styles.info}>
          <SectionLabel>The collection (all two of them)</SectionLabel>
          <h1 className={styles.h1}>{PRODUCT.name}</h1>
          <div className={styles.price}>{formatMoney(BASE_PRICE)}</div>
          <p className={styles.desc}>100% wool felt, embroidered (never printed) with &ldquo;Smelt&rdquo; on the front and &ldquo;Warm regards&rdquo; on the back. One size fits most heads. Made to sweat in.</p>
          <ul className={styles.benefits}>
            <li>Insulates your scalp and ears from intense sauna heat</li>
            <li>Dense 100% wool felt with no synthetic blend</li>
            <li>Relaxed one-size shape designed to sit loose, not clamp</li>
          </ul>

          <fieldset className={styles.purchaseOptions}>
            <legend className={styles.optLabel}>Choose your order</legend>
            <label className={`${styles.purchaseCard} ${purchaseOption === "single" ? styles.purchaseCardOn : ""}`}>
              <input type="radio" name="purchaseOption" value="single" checked={purchaseOption === "single"} onChange={() => setPurchaseOption("single")} />
              <span><strong>One hat</strong><small>{formatMoney(BASE_PRICE)} + {formatMoney(SHIPPING_FEE)} delivery</small></span>
              <b>{formatMoney(BASE_PRICE + SHIPPING_FEE)} total</b>
            </label>
            <label className={`${styles.purchaseCard} ${purchaseOption === "bundle" ? styles.purchaseCardOn : ""}`}>
              <input type="radio" name="purchaseOption" value="bundle" checked={purchaseOption === "bundle"} onChange={() => setPurchaseOption("bundle")} />
              <span><strong>Two-hat bundle <em>Free delivery</em></strong><small>{formatMoney(lineTotal(2))} · Save {formatMoney(SHIPPING_FEE)} on delivery</small></span>
              <b>{formatMoney(lineTotal(2))} total</b>
            </label>
          </fieldset>

          {purchaseOption === "single" ? <div className={styles.opt}>
            <div className={styles.optLabel}>Colourway</div>
            <div className={styles.chips}>
              {(["green", "cream"] as Colour[]).map((c) => (
                <button
                  key={c}
                  className={`${styles.chip} ${colour === c ? styles.chipOn : ""}`}
                  onClick={() => setColour(c)}
                  disabled={stock?.[c] === 0}
                >
                  <span>{PRODUCT.variants[c].name}</span>
                  {stock && <small>{stock[c] === 0 ? "Out of stock" : `${stock[c]} left`}</small>}
                </button>
              ))}
            </div>
          </div> : <div className={styles.opt}>
            <div className={styles.optLabel}>Choose your two hats</div>
            <div className={styles.bundleChoices}>
              {([
                ["mixed", "One of each"],
                ["green", "Two green"],
                ["cream", "Two cream"],
              ] as const).map(([value, label]) => {
                const available = bundleAvailable(value);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.bundleChoice} ${bundleMix === value ? styles.bundleChoiceOn : ""}`}
                    onClick={() => {
                      setBundleMix(value);
                      if (value !== "mixed") setColour(value);
                    }}
                    aria-pressed={bundleMix === value}
                    disabled={!available}
                  >
                    <span>{label}</span>
                    {!available && <small>Not enough stock</small>}
                  </button>
                );
              })}
            </div>
          </div>}

          <button className={styles.add} onClick={add} disabled={!selectionInStock}>
            {stock === null ? "Checking stock…" : selectionInStock ? `${purchaseOption === "bundle" ? "Add two hats" : "Add to bag"} · ${formatMoney(total)}` : unavailableLabel}
          </button>

          <div className={styles.reassure}>
            {stock ? <span className={styles.stockLine} aria-live="polite">
              <strong>Forest Green: {stock.green === 0 ? "Out of stock" : `${stock.green} left`}</strong>
              <strong>Natural Cream: {stock.cream === 0 ? "Out of stock" : `${stock.cream} left`}</strong>
            </span> : <span><strong>Checking availability…</strong></span>}
            <span>Dispatched from Cape Town within 1–3 business days</span>
            <span>R90 nationwide delivery · <strong>Free when you buy two or more</strong></span>
            <span>Secure checkout powered by Paystack</span>
          </div>

          <div className={styles.accordions}>
            <Accordion title="Details" defaultOpen>
              <ul>
                <li>100% wool felt</li>
                <li>Embroidered lettering, front and back</li>
                <li>One size fits most heads</li>
                <li>Hang to dry between sessions</li>
              </ul>
            </Accordion>
            <Accordion title="Felt care">Air it out after each session and let it dry fully. Spot-clean with cool water. Never machine wash, because felt holds a grudge.</Accordion>
            <Accordion title="Shipping &amp; returns">
              <p>R90 delivery nationwide across South Africa. Buy two or more hats, in any colour combination, for free delivery.</p>
              <p>{POLICIES.shipping.dispatch} Courier transit times after dispatch:</p>
              <ul>{POLICIES.shipping.timelines.map(({ area, time }) => <li key={area}>{area}: {time}</li>)}</ul>
              <p>{POLICIES.shipping.tracking}</p>
              <Link href="/policies#returns-policy">Read our returns policy</Link>
            </Accordion>
          </div>
        </div>
      </div>

      <ProductReviews />
      <HairPSA />
      <div className={styles.stickyBar}>
        <div className={styles.stickyInfo}>{selectionLabel} · {formatMoney(total)}</div>
        <button className={styles.stickyAdd} onClick={add} disabled={!selectionInStock}>{stock === null ? "Checking…" : selectionInStock ? (purchaseOption === "bundle" ? "Add two" : "Add to bag") : unavailableLabel}</button>
      </div>
    </main>
  );
}
