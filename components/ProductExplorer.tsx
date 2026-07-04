"use client";
import { useState } from "react";
import { PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, formatMoney } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import HatSwap from "./HatSwap";
import SectionLabel from "./ui/SectionLabel";
import styles from "./ProductExplorer.module.css";

export default function ProductExplorer() {
  const [colour, setColour] = useState<Colour>("green");
  const { dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];

  const add = () => { dispatch({ type: "add", colour, qty: 1 }); openCart(); };

  return (
    <section id="shop" className={styles.section}>
      <div className={styles.header}>
        <div>
          <SectionLabel>The collection (all two of them)</SectionLabel>
          <h2 className={styles.h2}>Say hello coming in.<br />Warm regards going out.</h2>
        </div>
        <p className={styles.intro}>The front greets the sauna with your name. The back sends everyone off with <em>&ldquo;Warm regards.&rdquo;</em> Flip it around.</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.stage}>
          <HatSwap colour={colour} showLabel dropShadow />
        </div>

        <div className={styles.panel}>
          <div>
            <h3 className={styles.name}>{PRODUCT.name}</h3>
            <div className={styles.price}>{v.name} · {formatMoney(BASE_PRICE)}</div>
          </div>

          <div>
            <div className={styles.optLabel}>Colourway</div>
            <div className={styles.chips}>
              <button className={`${styles.chip} ${colour === "green" ? styles.chipOn : ""}`} onClick={() => setColour("green")}>Forest Green</button>
              <button className={`${styles.chip} ${colour === "cream" ? styles.chipOn : ""}`} onClick={() => setColour("cream")}>Natural Cream</button>
            </div>
          </div>

          <button className={styles.add} onClick={add}>Pre-order · {formatMoney(BASE_PRICE)}</button>
          <div className={styles.reassure}>Free felt care card. 30-day returns if it doesn&rsquo;t spark joy (or sweat).</div>
        </div>
      </div>
    </section>
  );
}
