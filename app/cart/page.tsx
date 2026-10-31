"use client";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import { useAvailability } from "@/lib/useAvailability";
import { PRODUCT, COLOURS } from "@/lib/product";
import {
  bundleDiscount,
  formatMoney,
  grandTotal,
  lineTotal,
  shippingFee,
  unitPrice,
  qualifiesForFreeShipping,
} from "@/lib/pricing";
import styles from "./cart.module.css";

export default function CartPage() {
  const { cart, dispatch, subtotal } = useCart();
  const { stock, error: stockError, refresh } = useAvailability();
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const freeShip = qualifiesForFreeShipping(cart.green + cart.cream);
  const delivery = shippingFee(cart.green + cart.cream);
  const total = grandTotal(subtotal, cart.green + cart.cream);
  const discount = bundleDiscount(cart.green + cart.cream);

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>Your bag</h1>
      {lines.length === 0 ? (
        <div className={styles.empty}>
          <p>Nothing in here yet. Your head is unprotected.</p>
          <Link href="/product" className={styles.shopLink}>
            Shop hats →
          </Link>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.lines}>
            {lines.map((c) => {
              const v = PRODUCT.variants[c];
              const maxQuantity = stock ? stock[c] : 0;
              const atStockLimit = stock !== null && cart[c] >= maxQuantity;
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
                      {formatMoney(unitPrice())} each
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
                          dispatch({ type: "add", colour: c, qty: 1, maxQuantity })
                        }
                        aria-label={`Increase ${v.name}`}
                        disabled={stock === null || atStockLimit}
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
                    {atStockLimit && <small role="status">Only {maxQuantity} available</small>}
                    {stock === null && !stockError && <small role="status">Checking stock…</small>}
                  </div>
                  <div className={styles.lineTotal}>
                    {formatMoney(lineTotal(cart[c]))}
                  </div>
                </div>
              );
            })}
          </div>

          <aside className={styles.summary}>
            {stockError && <p role="alert">{stockError} <button onClick={() => void refresh()}>Retry</button></p>}
            <div className={styles.shipMsg}>
              {freeShip
                ? "Free shipping unlocked. Warm regards."
                : "Add a second hat in either colour for free delivery."}
            </div>
            {discount > 0 && <>
              <div className={styles.row}><span>Hats before discount</span><span>{formatMoney(subtotal + discount)}</span></div>
              <div className={styles.row}><span>Bundle discount</span><span>−{formatMoney(discount)}</span></div>
            </>}
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className={styles.rowMuted}>
              <span>Express delivery</span>
              <span>{delivery === 0 ? "FREE" : formatMoney(delivery)}</span>
            </div>
            <div className={styles.total}>
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
            <Link href="/checkout" className={styles.checkout}>
              Checkout securely · {formatMoney(total)}
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
