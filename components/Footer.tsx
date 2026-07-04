"use client";
import { useState } from "react";
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
            <NewsletterSignup styles={styles} />
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

function NewsletterSignup({ styles }: { styles: Record<string, string> }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className={styles.blurb}>Thanks — warm regards. Check your inbox.</p>;
  }
  return (
    <form className={styles.signup} onSubmit={submit}>
      <input
        className={styles.input}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        required
      />
      <button className={styles.join} type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Joining…" : "Join"}
      </button>
      {state === "error" && <span className={styles.blurb}>Something went wrong — try again.</span>}
    </form>
  );
}
