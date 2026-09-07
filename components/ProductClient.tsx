"use client";
import { useEffect, useRef, useState } from "react";
import ProductGallery from "@/components/ProductGallery";
import Accordion from "@/components/Accordion";
import HairPSA from "@/components/HairPSA";
import SectionLabel from "@/components/ui/SectionLabel";
import { PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, formatMoney, lineTotal } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import { META_CURRENCY, metaVariantContent } from "@/lib/meta";
import { trackMetaEvent } from "@/lib/metaPixel";
import { tiktokContent } from "@/lib/tiktok";
import { trackTikTokEvent } from "@/lib/tiktokPixel";
import styles from "@/app/product/product.module.css";

export default function ProductClient() {
  const viewed = useRef(false);
  const [colour, setColour] = useState<Colour>("green");
  const [qty, setQty] = useState(1);
  const { dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];
  const total = lineTotal(qty);
  const add = () => { dispatch({ type: "add", colour, qty }); openCart(); };

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
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
      <div className={styles.grid}>
        <ProductGallery colour={colour} />

        <div className={styles.info}>
          <SectionLabel>The collection (all two of them)</SectionLabel>
          <h1 className={styles.h1}>{PRODUCT.name}</h1>
          <div className={styles.price}>{formatMoney(BASE_PRICE)}</div>
          <p className={styles.desc}>100% merino wool felt, embroidered (never printed) with &ldquo;Smelt&rdquo; on the front and &ldquo;Warm regards&rdquo; on the back. One size fits most heads. Made to sweat in.</p>

          <div className={styles.opt}>
            <div className={styles.optLabel}>Colourway</div>
            <div className={styles.chips}>
              {(["green","cream"] as Colour[]).map((c) => (
                <button key={c} className={`${styles.chip} ${colour === c ? styles.chipOn : ""}`} onClick={() => { setColour(c); }}>{PRODUCT.variants[c].name}</button>
              ))}
            </div>
          </div>

          <div className={styles.opt}>
            <div className={styles.optLabel}>Quantity {qty >= 2 && <span className={styles.savePill}>{qty >= 3 ? "10% off" : "5% off"}</span>}</div>
            <div className={styles.qty}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity">+</button>
            </div>
            <div className={styles.reassure} style={{ marginTop: '8px', color: 'var(--terracotta)' }}>
              Bundle &amp; save: 5% off 2 hats, 10% off 3+ hats.
            </div>
          </div>

          <button className={styles.add} onClick={add}>Add to bag · {formatMoney(total)}</button>

          <div className={styles.accordions}>
            <Accordion title="Details" defaultOpen>
              <ul>
                <li>100% merino wool felt</li>
                <li>Embroidered lettering, front and back</li>
                <li>One size fits most heads</li>
                <li>Hang to dry between sessions</li>
              </ul>
            </Accordion>
            <Accordion title="Felt care">Air it out after each session and let it dry fully. Spot-clean with cool water. Never machine wash, because felt holds a grudge.</Accordion>
            <Accordion title="Shipping &amp; returns">R90 shipping nationwide across South Africa (free shipping on orders over R500).</Accordion>
          </div>
        </div>
      </div>

      <HairPSA />
      <div className={styles.stickyBar}>
        <div className={styles.stickyInfo}>{v.name} · {formatMoney(total)}</div>
        <button className={styles.stickyAdd} onClick={add}>Add to bag</button>
      </div>
    </main>
  );
}
