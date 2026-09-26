'use client';
import { useCart } from '@/lib/cart';
import { useAvailability } from '@/lib/useAvailability';
import { hasPreorder, preorderQuantities } from '@/lib/preorders';
import styles from './RestockChoice.module.css';
export default function PreorderNotice() {
  const { cart } = useCart();
  const { stock } = useAvailability();
  if (!stock || !hasPreorder(preorderQuantities(cart, stock))) return null;
  return <aside className={styles.notice} aria-label="Pre-order delivery"><strong>Pre-order</strong><p>{stock.timing} All hats ship together.</p></aside>;
}
