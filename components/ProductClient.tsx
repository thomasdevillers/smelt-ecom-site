"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProductGallery from "@/components/ProductGallery";
import HairPSA from "@/components/HairPSA";
import InTheWild from "@/components/InTheWild";
import Faq from "@/components/Faq";
import ProductReviews from "@/components/ProductReviews";
import AskAboutHat from "@/components/AskAboutHat";
import SectionLabel from "@/components/ui/SectionLabel";
import { COLOURS, PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, shippingFee, formatMoney, bundleSubtotal, bundleDeliveredSaving } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import { BUNDLE_GREEN_COUNTS, PURCHASE_QUANTITIES, bundleChoiceLabel, canAddSelection, type PurchaseQuantity } from "@/lib/bundleChoices";
import type { CartState } from "@/lib/cartReducer";
import { META_CURRENCY, metaVariantContent } from "@/lib/meta";
import { trackMetaEvent } from "@/lib/metaPixel";
import { tiktokContent } from "@/lib/tiktok";
import { trackTikTokEvent } from "@/lib/tiktokPixel";
import { trackVercelEvent, vercelProductData } from "@/lib/vercelAnalytics";
import styles from "@/app/product/product.module.css";
import { useAvailability } from "@/lib/useAvailability";
import { PREORDER_MODE } from "@/lib/salesMode";
import PreorderPrice from "./PreorderPrice";

function ProductLinkSelection({ onSelect }: { onSelect: (colour: Colour, quantity: PurchaseQuantity) => void }) {
  const params = useSearchParams();
  const colour = params.get("colour") === "cream" ? "cream" : "green";
  const order = params.get("order");
  const quantity: PurchaseQuantity = order === "bundle" || order === "2" ? 2 : order === "3" ? 3 : order === "4" ? 4 : 1;
  useEffect(() => {
    onSelect(colour, quantity);
  }, [colour, quantity, onSelect]);
  return null;
}

export default function ProductClient() {
  const viewed = useRef(false);
  const [colour, setColour] = useState<Colour>("green");
  const [quantity, setQuantity] = useState<PurchaseQuantity>(1);
  const [bundleGreen, setBundleGreen] = useState(1);
  const selectFromLink = useCallback((selectedColour: Colour, quantity: PurchaseQuantity) => {
    setColour(selectedColour);
    setQuantity(quantity);
    setBundleGreen(Math.ceil(quantity / 2));
  }, []);
  const { stock, error: stockError, refresh } = useAvailability();
  const { cart, dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];
  const total = bundleSubtotal(quantity);
  const isBundle = quantity > 1;
  const selection: CartState = isBundle
    ? { green: bundleGreen, cream: quantity - bundleGreen }
    : { green: colour === "green" ? 1 : 0, cream: colour === "cream" ? 1 : 0 };
  const bundleChoices = quantity === 1 ? [] : BUNDLE_GREEN_COUNTS[quantity];
  const selectionLabel = isBundle ? bundleChoiceLabel(bundleGreen, quantity) : v.name;
  const selectionInStock = stock !== null && canAddSelection(selection, cart, stock);
  const selectedColours = COLOURS.filter(c => selection[c] > 0);
  const isPreorder = stock !== null && selectedColours.some(c => cart[c] + selection[c] > stock[c]);
  const add = () => {
    if (!selectionInStock) return;
    if (isBundle) dispatch({ type: "addBundle", quantities: selection });
    else dispatch({ type: "add", colour, qty: 1 });
    openCart();
  };
  const chooseQuantity = (next: PurchaseQuantity) => {
    setQuantity(next);
    setBundleGreen(Math.ceil(next / 2));
  };
  const singleDelivery = shippingFee(BASE_PRICE);
  const bundleStatus = (green: number) => {
    if (!stock) return "Checking stock…";
    const mix = { green, cream: quantity - green };
    if (!canAddSelection(mix, cart, stock)) return PREORDER_MODE ? "Fully reserved" : "Not enough stock";
    if (PREORDER_MODE) return "Pre-order";
    return COLOURS.some(c => mix[c] > 0 && cart[c] + mix[c] > stock[c]) ? "Includes pre-order" : "In stock";
  };
  const selectionStatus = (c: Colour) => {
    if (!stock) return "Checking stock…";
    const qty = selection[c];
    if (stock[c] + stock.preorder[c] < cart[c] + qty) return PREORDER_MODE ? "Fully reserved" : "Not enough stock";
    if (PREORDER_MODE) return "Pre-order";
    const ready = Math.min(qty, Math.max(0, stock[c] - cart[c]));
    return ready === qty ? "In stock" : ready > 0 ? `${ready} in stock · ${qty - ready} on pre-order` : "Pre-order";
  };
  const unavailableLabel = PREORDER_MODE ? "Pre-orders fully reserved" : !isBundle && stock?.[colour] === 0
    ? "Out of stock"
    : "Not enough stock";
  const addLabel = isPreorder ? (isBundle ? `Pre-order ${quantity} hats` : "Pre-order") : isBundle ? `Add ${quantity} hats` : "Add to bag";

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


  return (
    <main className={styles.page}>
      <Suspense fallback={null}><ProductLinkSelection onSelect={selectFromLink} /></Suspense>
      <div className={styles.grid}>
        <ProductGallery colour={colour} onColourChange={setColour} />

        <div className={styles.info}>
          <SectionLabel>The collection (all two of them)</SectionLabel>
          <h1 className={styles.h1}>{PRODUCT.name}</h1>
          {PREORDER_MODE ? <PreorderPrice /> : <div className={styles.price}>{formatMoney(BASE_PRICE)}</div>}
          {process.env.NEXT_PUBLIC_ASK_HAT_ENABLED !== "false" && <div className={styles.productAssistant}><AskAboutHat /></div>}

          <fieldset className={styles.purchaseOptions}>
            <legend className={styles.optLabel}>Choose your order</legend>
            {PURCHASE_QUANTITIES.map(qty => (
              <label key={qty} className={`${styles.purchaseCard} ${qty >= 3 ? styles.purchaseCardWithBanner : ""} ${quantity === qty ? styles.purchaseCardOn : ""}`}>
                {qty >= 3 && <em className={styles.purchaseBanner}>{qty === 4 ? "Best value" : "Most popular"}</em>}
                <input type="radio" name="purchaseOption" value={qty} checked={quantity === qty} onChange={() => chooseQuantity(qty)} />
                <span>
                  <strong>{qty === 1 ? "One hat" : qty === 2 ? "Two-hat bundle" : `${qty}-hat bundle`}{qty > 1 && <em>Save {formatMoney(bundleDeliveredSaving(qty))}</em>}</strong>
                  <small>{qty === 1
                    ? `${formatMoney(BASE_PRICE)} · ${singleDelivery ? `${formatMoney(singleDelivery)} delivery` : "Free delivery"}`
                    : "Free delivery"}</small>
                </span>
                <b>{formatMoney(qty === 1 ? BASE_PRICE + singleDelivery : bundleSubtotal(qty))} total</b>
              </label>
            ))}
          </fieldset>
          {quantity >= 3 && <p className={styles.savingsNote}>Savings compared with {formatMoney(BASE_PRICE)} per hat plus R90 delivery.</p>}

          {!isBundle ? <div className={styles.opt}>
            <div className={styles.optLabel}>Colourway</div>
            <div className={`${styles.bundleChoices} ${styles.bundleChoicesLarge}`}>
              {COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.bundleChoice} ${colour === c ? styles.bundleChoiceOn : ""}`}
                  onClick={() => setColour(c)}
                  aria-pressed={colour === c}
                >
                  <span className={styles.bundleSwatches} aria-hidden="true">
                    <i style={{ backgroundColor: PRODUCT.variants[c].swatch }} />
                  </span>
                  <span>{PRODUCT.variants[c].name}</span>
                  {stock && <small>{PREORDER_MODE ? (stock.preorder[c] > 0 ? "Pre-order" : "Fully reserved") : stock[c] === 0 ? "Out of stock" : `${stock[c]} left`}</small>}
                </button>
              ))}
            </div>
          </div> : <div className={styles.opt}>
            <div className={styles.optLabel}>Choose your {quantity} hats</div>
            <div className={`${styles.bundleChoices} ${quantity >= 3 ? styles.bundleChoicesLarge : ""}`}>
              {bundleChoices.map(green => {
                const mix = { green, cream: quantity - green };
                const available = stock === null || canAddSelection(mix, cart, stock);
                return (
                  <button
                    key={green}
                    type="button"
                    className={`${styles.bundleChoice} ${bundleGreen === green ? styles.bundleChoiceOn : ""}`}
                    onClick={() => {
                      setBundleGreen(green);
                      setColour(green === 0 ? "cream" : "green");
                    }}
                    aria-pressed={bundleGreen === green}
                    disabled={!available}
                  >
                    <span className={styles.bundleSwatches} aria-hidden="true">
                      {COLOURS.flatMap(c => Array.from({ length: mix[c] }, (_, i) => (
                        <i key={`${c}-${i}`} style={{ backgroundColor: PRODUCT.variants[c].swatch }} />
                      )))}
                    </span>
                    <span>{bundleChoiceLabel(green, quantity)}</span>
                    <small>{bundleStatus(green)}</small>
                  </button>
                );
              })}
            </div>
          </div>}

          {isBundle && <div className={styles.bundleStock} aria-live="polite" aria-atomic="true">
            <strong>Your bundle · {quantity} hats</strong>
            <ul>{selectedColours.map(c => (
              <li key={c}><span>{selection[c]} × {PRODUCT.variants[c].name}</span><span>{selectionStatus(c)}</span></li>
            ))}</ul>
            {stock && !selectionInStock ? <p>Choose another available mix.</p> : <p>All hats ship together. Free delivery.</p>}
          </div>}

          <button className={styles.add} onClick={add} disabled={!selectionInStock}>
            {stock === null ? "Checking stock…" : selectionInStock ? `${addLabel} · ${formatMoney(total)}` : unavailableLabel}
          </button>

          {stockError && <p role="alert">{stockError} <button onClick={() => void refresh()}>Retry</button></p>}
          {!isPreorder && <div className={styles.reassure}>
            <span>In-stock orders dispatched from Cape Town within 1–3 business days</span>
          </div>}
        </div>
      </div>

      <ProductReviews />
      <HairPSA />
      <InTheWild />
      <Faq />
      <div className={styles.stickyBar}>
        <div className={styles.stickyInfo}>{selectionLabel} · {formatMoney(total)}</div>
        <button className={styles.stickyAdd} onClick={add} disabled={!selectionInStock}>{stock === null ? "Checking…" : selectionInStock ? addLabel : unavailableLabel}</button>
      </div>
    </main>
  );
}
