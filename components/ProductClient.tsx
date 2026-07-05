"use client";
import { useState } from "react";
import ProductGallery from "@/components/ProductGallery";
import Accordion from "@/components/Accordion";
import HairPSA from "@/components/HairPSA";
import Reels from "@/components/Reels";
import SectionLabel from "@/components/ui/SectionLabel";
import { PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, formatMoney, lineTotal } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import styles from "@/app/product/product.module.css";

export default function ProductClient() {
  const [colour, setColour] = useState<Colour>("green");
  const [qty, setQty] = useState(1);
  const { dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];
  const total = lineTotal(qty);
  const add = () => { dispatch({ type: "add", colour, qty }); openCart(); };

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

          <button className={styles.add} onClick={add}>Pre-order · {formatMoney(total)}</button>
          <div className={styles.reassure}>Free felt care card. 30-day returns if it doesn&rsquo;t spark joy (or sweat).</div>

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
            <Accordion title="Shipping &amp; returns">Ships worldwide from Cape Town. Free shipping over R1000. 30-day returns if it doesn&rsquo;t spark joy (or sweat).</Accordion>
          </div>
        </div>
      </div>

      <HairPSA />
      <Reels />

      <div className={styles.stickyBar}>
        <div className={styles.stickyInfo}>{v.name} · {formatMoney(total)}</div>
        <button className={styles.stickyAdd} onClick={add}>Pre-order</button>
      </div>
    </main>
  );
}
