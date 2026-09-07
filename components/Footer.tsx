import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div>
            <div className={styles.brand}>Smelt</div>
            <p className={styles.blurb}>Sauna hats made in Cape Town. Less heat on your head, more time on the bench.</p>
          </div>
          <div>
            <div className={styles.colTitle}>Shop</div>
            <div className={styles.colLinks}>
              <Link href="/product">Forest Green</Link>
              <Link href="/product">Natural Cream</Link>
              <Link href="/#bundles">Bundles</Link>
            </div>
          </div>
          <div>
            <div className={styles.colTitle}>Smelt</div>
            <div className={styles.colLinks}>
              <Link href="/#story">The story</Link>
              <Link href="/#felt">The felt</Link>
            </div>
          </div>
          <div>
            <div className={styles.colTitle}>Help</div>
            <div className={styles.colLinks}>
              <Link href="/care">Care guide</Link>
              <Link href="/#faq">FAQ</Link>
              <Link href="/policies">Store policies</Link>
              <Link href="/contact">Contact us</Link>
            </div>
          </div>
        </div>
        <div className={styles.base}>
          <div>© 2026 Smelt · Cape Town · Warm regards</div>
          <div className={styles.signoff}>See you at 90°C.</div>
        </div>
      </div>
    </footer>
  );
}
