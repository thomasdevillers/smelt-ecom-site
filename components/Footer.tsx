"use client";
import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div>
            <div className={styles.brand}>Smelt</div>
            <p className={styles.blurb}>Warm regards in your inbox: drops, restocks, and the occasional sauna opinion.</p>
            <form className={styles.signup} onSubmit={(e) => e.preventDefault()}>
              <input className={styles.input} placeholder="you@example.com" aria-label="Email address" />
              <button className={styles.join} type="submit">Join</button>
            </form>
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
              <Link href="/about">About</Link>
              <Link href="/#reels">Reels</Link>
              <Link href="/#felt">The felt</Link>
            </div>
          </div>
          <div>
            <div className={styles.colTitle}>Help</div>
            <div className={styles.colLinks}>
              <Link href="/care">Care guide</Link>
              <Link href="/#faq">FAQ</Link>
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
