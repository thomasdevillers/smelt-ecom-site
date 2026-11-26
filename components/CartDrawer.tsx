"use client";
import PreorderNotice from "@/components/PreorderNotice";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import { useAvailability } from "@/lib/inventory/useAvailability";
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
import styles from "./CartDrawer.module.css";
import { useEffect, useRef } from "react";

export default function CartDrawer() {
  const { cart, dispatch, subtotal, isOpen, closeCart, count } = useCart();
  const { stock, error: stockError, refresh } = useAvailability(null, isOpen);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = drawer.current;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCart();
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        root?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !root?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !root?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [isOpen, closeCart]);
  const lines = COLOURS.filter((c) => cart[c] > 0);
  const freeShip = qualifiesForFreeShipping(cart.green + cart.cream);
  const shipProgress = freeShip ? 100 : 50;
  const delivery = shippingFee(cart.green + cart.cream);
  const total = grandTotal(subtotal, cart.green + cart.cream);
  const discount = bundleDiscount(cart.green + cart.cream);

  return (
    <>
      <div
        className={`${styles.scrim} ${isOpen ? styles.scrimOpen : ""}`}
        onClick={closeCart}
        aria-hidden="true"
      />
      <aside
        ref={drawer}
        role="dialog"
        aria-modal={isOpen || undefined}
        aria-hidden={!isOpen}
        tabIndex={-1}
        className={`${styles.drawer} ${isOpen ? styles.open : ""}`}
        aria-label="Shopping bag"
        // inert also removes the closed drawer's controls from the tab order.
        inert={!isOpen}
      >
        <div className={styles.head}>
          <span className={styles.title}>Your bag · {count}</span>
          <button className={styles.close} onClick={closeCart} aria-label="Close bag">
            ✕
          </button>
        </div>

        {lines.length === 0 ? (
          <div className={styles.empty}>
            <p>Your bag is as empty as a cold sauna.</p>
            <Link href="/product" className={styles.shopLink} onClick={closeCart}>
              Shop hats →
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.lines}>
              {lines.map((c) => {
                const v = PRODUCT.variants[c];
                const maxQuantity = stock ? Math.min(99, stock[c] + stock.preorder[c]) : 0;
                const atStockLimit = stock !== null && cart[c] >= maxQuantity;
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
                      <div className={styles.lineMeta}>{formatMoney(unitPrice())} each</div>
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
                          disabled={stock === null || atStockLimit}
                          onClick={() => dispatch({ type: "add", colour: c, qty: 1, maxQuantity })}
                        >
                          +
                        </button>
                      </div>
                      {atStockLimit && <small role="status">Only {maxQuantity} available</small>}
                      {stock === null && !stockError && (
                        <small role="status">Checking stock…</small>
                      )}
                    </div>
                    <div className={styles.lineTotal}>{formatMoney(lineTotal(cart[c]))}</div>
                  </div>
                );
              })}
            </div>

            <div className={styles.foot}>
              {isOpen && <PreorderNotice />}
              {stockError && (
                <p role="alert">
                  {stockError} <button onClick={() => void refresh()}>Retry</button>
                </p>
              )}
              <div className={styles.shipMsg}>
                {freeShip
                  ? "You've unlocked free shipping. Warm regards."
                  : "Add a second hat in either colour for free delivery."}
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
              {discount > 0 && (
                <>
                  <div className={styles.costRow}>
                    <span>Hats before discount</span>
                    <span>{formatMoney(subtotal + discount)}</span>
                  </div>
                  <div className={styles.costRow}>
                    <span>Bundle discount</span>
                    <span>−{formatMoney(discount)}</span>
                  </div>
                </>
              )}
              <div className={styles.costRow}>
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className={styles.costRow}>
                <span>Express delivery</span>
                <span>{delivery === 0 ? "FREE" : formatMoney(delivery)}</span>
              </div>
              <div className={styles.total}>
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </div>
              <Link href="/checkout" className={styles.checkout} onClick={closeCart}>
                Checkout securely · {formatMoney(total)}
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
