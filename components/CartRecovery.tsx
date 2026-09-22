"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CART_RECOVERY_STORAGE_KEY, type CartRecoveryData } from "@/lib/cartRecoveryShared";
import styles from "./EmailPreference.module.css";

export default function CartRecovery({ data }: { data: CartRecoveryData | null }) {
  const router = useRouter();
  const started = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    if (!data || started.current) return;
    started.current = true;
    try {
      sessionStorage.setItem(CART_RECOVERY_STORAGE_KEY, JSON.stringify(data));
      router.replace("/checkout");
    } catch { queueMicrotask(() => setStorageFailed(true)); }
  }, [data, router]);

  if (!data || storageFailed) return <main className={styles.page}>
    <section className={styles.message}>
      <span>SMELT / CART</span>
      <h1>This link has cooled down.</h1>
      <p>{storageFailed ? "Your browser blocked the private cart hand-off." : "This private cart link is invalid or has expired. You can still start a fresh checkout."}</p>
      <Link className={styles.action} href="/product">Shop the hats →</Link>
    </section>
  </main>;

  return <main className={styles.page}>
    <section className={styles.message} aria-live="polite">
      <span>SMELT / CART</span>
      <h1>Warming your cart.</h1>
      <p>Restoring your hats and personal R50 code now…</p>
    </section>
  </main>;
}
