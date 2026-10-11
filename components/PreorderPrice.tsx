'use client';

import { useEffect, useState } from 'react';
import { countdownParts, PREORDER_COPY, PREORDER_DATE_LABEL, PREORDER_DEADLINE, PREORDER_PRICE, REGULAR_PRICE } from '@/lib/salesMode';
import { formatMoney } from '@/lib/pricing';
import styles from './PreorderPrice.module.css';

export default function PreorderPrice() {
  const [parts, setParts] = useState<number[] | null>(null);
  useEffect(() => {
    const tick = () => setParts(countdownParts(Date.now()));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  return <section className={styles.card} aria-label="Pre-order price and shipping date">
    <div className={styles.priceBlock}>
      <span className={styles.eyebrow}>Sold out · Pre-orders open</span>
      <div className={styles.price}>{formatMoney(PREORDER_PRICE)}<span>per hat</span></div>
      <p>{PREORDER_COPY}</p>
    </div>
    <div className={styles.arrival}>
      <p className={styles.increase}>Price increases to <strong>{formatMoney(REGULAR_PRICE)}</strong> when stock arrives.</p>
      <time dateTime={PREORDER_DEADLINE}>Ships on {PREORDER_DATE_LABEL}</time>
      <div className={styles.countdown} role="timer" aria-label="Time until pre-order shipping day" aria-live="off">
        {['Days', 'Hours', 'Minutes', 'Seconds'].map((label, index) => <div key={label}>
          <strong>{parts ? String(parts[index]).padStart(2, '0') : '—'}</strong><span>{label}</span>
        </div>)}
      </div>
      {parts?.every(part => part === 0) && <p className={styles.waiting}>We’ll email your tracking link when your order ships.</p>}
    </div>
  </section>;
}
