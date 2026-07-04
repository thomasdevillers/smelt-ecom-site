"use client";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import { PRODUCT, COLOURS } from "@/lib/product";
import {
  formatMoney,
  lineTotal,
  unitPrice,
  FREE_SHIP_THRESHOLD,
  qualifiesForFreeShipping,
} from "@/lib/pricing";
import styles from "./cart.module.css";

export default function CartPage() {
  const { cart, dispatch, subtotal } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const freeShip = qualifiesForFreeShipping(subtotal);
  const remaining = Math.max(0, FREE_SHIP_THRESHOLD + 1 - subtotal);

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>Your bag</h1>
      {lines.length === 0 ? (
        <div className={styles.empty}>
          <p>Nothing in here yet. Your head is unprotected.</p>
          <Link href="/product" className={styles.shopLink}>
            Pre-order yours →
          </Link>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.lines}>
            {lines.map((c) => {
              const v = PRODUCT.variants[c];
              return (
                <div key={c} className={styles.line}>
                  <Image
                    src={v.images.front}
                    alt={v.name}
                    width={96}
                    height={96}
                    className={styles.thumb}
                  />
                  <div className={styles.lineBody}>
                    <div className={styles.lineName}>{v.name}</div>
                    <div className={styles.lineMeta}>
                      {formatMoney(unitPrice(cart[c]))} each
                    </div>
                    <div className={styles.qtyRow}>
                      <button
                        onClick={() =>
                          dispatch({ type: "set", colour: c, qty: cart[c] - 1 })
                        }
                        aria-label={`Decrease ${v.name}`}
                      >
                        −
                      </button>
                      <span>{cart[c]}</span>
                      <button
                        onClick={() =>
                          dispatch({ type: "add", colour: c, qty: 1 })
                        }
                        aria-label={`Increase ${v.name}`}
                      >
                        +
                      </button>
                      <button
                        className={styles.remove}
                        onClick={() => dispatch({ type: "remove", colour: c })}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className={styles.lineTotal}>
                    {formatMoney(lineTotal(cart[c]))}
                  </div>
                </div>
              );
            })}
          </div>

          <aside className={styles.summary}>
            <div className={styles.shipMsg}>
              {freeShip
                ? "Free shipping unlocked. Warm regards."
                : `${formatMoney(remaining)} away from free shipping.`}
            </div>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className={styles.rowMuted}>
              <span>Shipping</span>
              <span>{freeShip ? "Free" : "Calculated at checkout"}</span>
            </div>
            <Link href="/checkout" className={styles.checkout}>
              Pre-order · {formatMoney(subtotal)}
            </Link>
            <Link href="/product" className={styles.keep}>
              Keep shopping
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
