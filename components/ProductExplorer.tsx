"use client";
import { useEffect, useRef, useState } from "react";
import { PRODUCT, type Colour } from "@/lib/product";
import { BASE_PRICE, formatMoney } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import HatSwap from "./HatSwap";
import SectionLabel from "./ui/SectionLabel";
import styles from "./ProductExplorer.module.css";
import { trackVercelEvent, vercelProductData } from "@/lib/vercelAnalytics";
import { useAvailability } from "@/lib/useAvailability";
import RestockChoice from "@/components/RestockChoice";

export default function ProductExplorer() {
  const [colour, setColour] = useState<Colour>("green");
  const { stock, error: stockError, refresh } = useAvailability();
  const sectionRef = useRef<HTMLElement>(null);
  const viewed = useRef(false);
  const { cart, dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];

  const inStock = stock !== null && stock[colour] + stock.preorder[colour] >= cart[colour] + 1;
  const isPreorder = stock !== null && cart[colour] + 1 > stock[colour];
  const add = () => {
    if (!inStock) return;
    dispatch({ type: "add", colour, qty: 1 });
    openCart();
  };


  useEffect(() => {
    const section = sectionRef.current;
    if (!section || viewed.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || viewed.current) return;
      viewed.current = true;
      trackVercelEvent("ViewContent", vercelProductData(colour, 1));
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [colour]);

  return (
    <section ref={sectionRef} id="shop" className={styles.section}>
      <div className={styles.header}>
        <div>
          <SectionLabel>The collection (all two of them)</SectionLabel>
          <h2 className={styles.h2}>Say hello coming in.<br />Warm regards going out.</h2>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.stage}>
          <HatSwap colour={colour} dropShadow />
        </div>

        <div className={styles.panel}>
          <div>
            <h3 className={styles.name}>{PRODUCT.name}</h3>
            <div className={styles.price}>{v.name} · {formatMoney(BASE_PRICE)}</div>
          </div>

          <div>
            <div className={styles.optLabel}>Colourway</div>
            <div className={styles.chips}>
              {(["green", "cream"] as Colour[]).map((choice) => (
                <button
                  key={choice}
                  className={`${styles.chip} ${colour === choice ? styles.chipOn : ""}`}
                  onClick={() => setColour(choice)}
                  aria-pressed={colour === choice}
                >
                  <span>{PRODUCT.variants[choice].name}</span>
                  {stock && <small>{stock[choice] === 0 ? "Out of stock" : `${stock[choice]} left`}</small>}
                </button>
              ))}
            </div>
          </div>

          <button className={styles.add} onClick={add} disabled={!inStock}>
            {stock === null ? "Checking stock…" : inStock ? `${isPreorder ? "Pre-order" : "Add to bag"} · ${formatMoney(BASE_PRICE)}` : stock[colour] === 0 ? "Out of stock" : "Not enough stock"}
          </button>
          {stockError && <p role="alert">{stockError} <button onClick={() => void refresh()}>Retry</button></p>}
          {stock && stock[colour] === 0 && <RestockChoice key={colour} colour={colour} timing={stock.timing} canPreorder={stock.preorder[colour] > 0} />}
        </div>
      </div>
    </section>
  );
}
