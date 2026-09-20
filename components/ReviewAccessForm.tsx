"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./ReviewForm.module.css";

export default function ReviewAccessForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reviews/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { reviewUrl?: string; error?: string };
      if (!response.ok || !result.reviewUrl) throw new Error(result.error || "We couldn’t verify your order.");
      router.push(result.reviewUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t verify your order.");
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <div className={styles.intro}>
      <span>SMELT / VERIFIED PURCHASE</span>
      <h1>Warm words welcome.</h1>
      <p>Enter the email address used at checkout. We’ll confirm your completed order before opening the review form.</p>
    </div>
    <form className={styles.form} onSubmit={submit}>
      <label>Order email<input required autoComplete="email" inputMode="email" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} disabled={busy}>{busy ? "Checking your order…" : "Continue to review →"}</button>
      <p className={styles.privacy}>We only use your email to find your order. It will never appear with your review.</p>
      <Link className={styles.privacy} href="/product#reviews">← Back to reviews</Link>
    </form>
  </main>;
}
