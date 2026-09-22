'use client';
import { useCart } from '@/lib/cart';
import { useAvailability } from '@/lib/useAvailability';
import { hasPreorder, preorderQuantities } from '@/lib/preorders';
import { COLOURS, PRODUCT } from '@/lib/product';
import styles from './RestockChoice.module.css';
export default function PreorderNotice() {
  const { cart } = useCart();
  const { stock } = useAvailability();
  if (!stock || !hasPreorder(preorderQuantities(cart, stock))) return null;
  const quantities = preorderQuantities(cart, stock);
  return <aside className={styles.notice} aria-label="Pre-order delivery"><strong>This bag includes a pre-order</strong>{COLOURS.filter(c => quantities[c] > 0).map(c => <p key={c}>{quantities[c]} × {PRODUCT.variants[c].name} — pre-order</p>)}<p>{stock.timing} All hats will ship together. For an in-stock hat sooner, place a separate order.</p><p>Pay in full at checkout to reserve your hats. You’ll confirm the wait before payment.</p></aside>;
}
