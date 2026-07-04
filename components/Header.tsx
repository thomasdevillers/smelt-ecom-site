"use client";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import styles from "./Header.module.css";

const NAV = [
  { href: "/product", label: "Shop" },
  { href: "/#bundles", label: "Bundles" },
  { href: "/#reels", label: "Reels" },
  { href: "/about", label: "About" },
];

export default function Header() {
  const { count, openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <button
          className={styles.burger}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>

        <Link href="/" className={styles.logo}>Smelt</Link>

        <div className={styles.links}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={styles.link}>{n.label}</Link>
          ))}
        </div>

        <button className={styles.bag} onClick={openCart} aria-label="Open bag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          Bag · {count}
        </button>
      </nav>

      {menuOpen && (
        <div className={styles.drawer}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={styles.drawerLink} onClick={() => setMenuOpen(false)}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
