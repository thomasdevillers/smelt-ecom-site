"use client";
import Image from "next/image";
import { useState } from "react";
import { PRODUCT, COLOURS, type Colour } from "@/lib/product";
import { formatMoney, lineTotal, unitPrice, BASE_PRICE } from "@/lib/pricing";
import { useCart } from "@/lib/cart";
import SectionLabel from "./ui/SectionLabel";
import styles from "./Bundles.module.css";

const TIERS = [
  { qty: 1, badge: null, sub: "for you, obviously" },
  { qty: 2, badge: "5% OFF", sub: "you + a plus one" },
  { qty: 3, badge: "10% OFF · BEST", sub: "the whole löyly gang" },
];

function BundleCard() {
  const [colour, setColour] = useState<Colour>("green");
  const [sel, setSel] = useState(1);
  const { dispatch, openCart } = useCart();
  const v = PRODUCT.variants[colour];
  const saved = BASE_PRICE * sel - lineTotal(sel);
  const add = () => { dispatch({ type: "add", colour, qty: sel }); openCart(); };

  return (
    <div className={`${styles.card} ${styles.dark}`}>
      <div className={styles.cardHead}>
        <div className={styles.avatar}><Image src={v.images.front} alt={v.name} width={78} height={78} /></div>
        <div>
          <h3 className={styles.cardName}>{PRODUCT.name}</h3>
          <div className={styles.cardMeta}>{v.name} · from {formatMoney(unitPrice(3))} each</div>
        </div>
      </div>

      <div className={styles.colours}>
        {COLOURS.map((c) => (
          <button
            key={c}
            className={`${styles.swatchBtn} ${colour === c ? styles.swatchOn : ""}`}
            onClick={() => setColour(c)}
            aria-label={PRODUCT.variants[c].name}
            aria-pressed={colour === c}
          >
            <span className={styles.swatchDot} style={{ background: PRODUCT.variants[c].swatch }} />
            {PRODUCT.variants[c].name}
          </button>
        ))}
      </div>

      <div className={styles.tiers}>
        {TIERS.map((t) => (
          <button key={t.qty} className={`${styles.tier} ${sel === t.qty ? styles.tierOn : ""}`} onClick={() => setSel(t.qty)}>
            <span className={styles.tierLeft}>
              <span className={styles.tierQty}>{t.qty} {t.qty > 1 ? "hats" : "hat"}{t.badge && <span className={styles.badge}>{t.badge}</span>}</span>
              <span className={styles.tierSub}>{t.sub}</span>
            </span>
            <span className={styles.tierRight}>
              <span className={styles.tierPrice}>{formatMoney(lineTotal(t.qty))}</span>
              <span className={styles.tierEach}>{t.qty > 1 ? `${formatMoney(unitPrice(t.qty))} each` : "full price"}</span>
            </span>
          </button>
        ))}
      </div>

      <div className={styles.saveLine}>{saved > 0 ? `You just saved ${formatMoney(saved)}!` : "Full price. Live a little."}</div>
      <button className={styles.addBtn} onClick={add}>Pre-order {sel} {sel > 1 ? "hats" : "hat"} · {formatMoney(lineTotal(sel))}</button>
    </div>
  );
}

export default function Bundles() {
  return (
    <section id="bundles" className={styles.section}>
      <div className={styles.head}>
        <SectionLabel>Stack &amp; save</SectionLabel>
        <h2 className={styles.h2}>The more you sweat together, the more you save.</h2>
        <p className={styles.intro}>Pick your colourway, then your crew size. Kit out the whole sauna gang, and the discount climbs with the group.</p>
      </div>
      <div className={styles.grid}>
        <BundleCard />
      </div>
    </section>
  );
}
