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
import styles from "./CartDrawer.module.css";

export default function CartDrawer() {
  const { cart, dispatch, subtotal, isOpen, closeCart, count } = useCart();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const freeShip = qualifiesForFreeShipping(subtotal);
  const remaining = Math.max(0, FREE_SHIP_THRESHOLD + 1 - subtotal);
  const shipProgress = Math.min(100, (subtotal / (FREE_SHIP_THRESHOLD + 1)) * 100);

  return (
    <>
      <div
        className={`${styles.scrim} ${isOpen ? styles.scrimOpen : ""}`}
        onClick={closeCart}
        aria-hidden={!isOpen}
      />
      <aside
        className={`${styles.drawer} ${isOpen ? styles.open : ""}`}
        aria-label="Shopping bag"
        aria-hidden={!isOpen}
      >
        <div className={styles.head}>
          <span className={styles.title}>Your bag · {count}</span>
          <button
            className={styles.close}
            onClick={closeCart}
            aria-label="Close bag"
          >
            ✕
          </button>
        </div>

        {lines.length === 0 ? (
          <div className={styles.empty}>
            <p>Your bag is as empty as a cold sauna.</p>
            <Link
              href="/product"
              className={styles.shopLink}
              onClick={closeCart}
            >
              Pre-order yours →
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.lines}>
              {lines.map((c) => {
                const v = PRODUCT.variants[c];
                return (
                  <div key={c} className={styles.line}>
                    <Image
                      src={v.images.front}
                      alt={v.name}
                      width={64}
                      height={64}
                      className={styles.thumb}
                    />
                    <div className={styles.lineBody}>
                      <div className={styles.lineName}>{v.name}</div>
                      <div className={styles.lineMeta}>
                        {formatMoney(unitPrice(cart[c]))} each
                      </div>
                      <div className={styles.qtyRow}>
                        <button
                          aria-label={`Decrease ${v.name}`}
                          onClick={() =>
                            dispatch({
                              type: "set",
                              colour: c,
                              qty: cart[c] - 1,
                            })
                          }
                        >
                          −
                        </button>
                        <span>{cart[c]}</span>
                        <button
                          aria-label={`Increase ${v.name}`}
                          onClick={() =>
                            dispatch({ type: "add", colour: c, qty: 1 })
                          }
                        >
                          +
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

            <div className={styles.foot}>
              <div className={styles.shipMsg}>
                {freeShip
                  ? "You've unlocked free shipping. Warm regards."
                  : `${formatMoney(remaining)} away from free shipping.`}
              </div>
              <div
                className={styles.shipBar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(shipProgress)}
                aria-label="Progress toward free shipping"
              >
                <div
                  className={`${styles.shipFill} ${freeShip ? styles.shipFull : ""}`}
                  style={{ width: `${shipProgress}%` }}
                />
              </div>
              <div className={styles.subtotal}>
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <Link
                href="/checkout"
                className={styles.checkout}
                onClick={closeCart}
              >
                Pre-order · {formatMoney(subtotal)}
              </Link>
              <Link href="/cart" className={styles.viewBag} onClick={closeCart}>
                View full bag
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
