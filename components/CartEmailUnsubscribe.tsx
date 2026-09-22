"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./EmailPreference.module.css";

export default function CartEmailUnsubscribe({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function unsubscribe() {
    if (status === "busy" || status === "done") return;
    setStatus("busy");
    try {
      const response = await fetch("/api/cart-emails/unsubscribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error();
      setStatus("done");
    } catch { setStatus("error"); }
  }

  return <main className={styles.page}>
    <section className={styles.message}>
      <span>SMELT / EMAIL PREFERENCES</span>
      <h1>{status === "done" ? "You’re all set." : "Fewer nudges. More sauna."}</h1>
      {status === "done" ? <>
        <p>You won’t receive any more automated emails about abandoned Smelt checkouts at this address.</p>
        <Link className={styles.secondary} href="/product">Back to Smelt</Link>
      </> : <>
        <p>Confirm below and we’ll stop the automated checkout reminder sequence. Order and shipping emails for purchases are not affected.</p>
        <button className={styles.action} type="button" onClick={() => void unsubscribe()} disabled={status === "busy"}>
          {status === "busy" ? "Updating…" : "Stop checkout emails"}
        </button>
        {status === "error" && <p className={styles.error} role="alert">We couldn’t update this right now. Please try again.</p>}
      </>}
    </section>
  </main>;
}
