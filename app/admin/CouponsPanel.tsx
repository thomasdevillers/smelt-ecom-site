"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Coupon } from "@/lib/coupons";
import { formatMoney } from "@/lib/pricing";
import styles from "./admin.module.css";

export default function CouponsPanel({ onExpired }: { onExpired: () => void }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useCallback(async (init?: RequestInit) => {
    const response = await fetch("/api/admin/coupons", { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
    if (response.status === 401) { onExpired(); throw new Error("Please sign in again."); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save coupons.");
    return result;
  }, [onExpired]);
  const load = useCallback(async () => {
    try { const result = await request(); setCoupons(result.coupons); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load coupons."); }
  }, [request]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await request({ method: "POST", body: JSON.stringify({ code, amount: Number(amount), maxUses: Number(maxUses) }) });
      setCode(""); setAmount(""); setMaxUses(""); setMessage(`${result.coupon.code} created.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create coupon."); }
    finally { setBusy(false); }
  }
  async function toggle(coupon: Coupon) {
    setBusy(true); setError(""); setMessage("");
    try { await request({ method: "PATCH", body: JSON.stringify({ code: coupon.code, active: !coupon.active }) }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update coupon."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Coupon codes">
    <form className={styles.couponForm} onSubmit={create}>
      <label>Coupon code<input required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,39}" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="WARM50" value={code} onChange={event => setCode(event.target.value.toUpperCase())} disabled={busy} /></label>
      <label>Amount off (R)<input type="number" min={1} max={100000} step={1} required placeholder="50" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
      <label>Usage limit<input type="number" min={1} max={1000000} step={1} required placeholder="100" value={maxUses} onChange={event => setMaxUses(event.target.value)} disabled={busy} /></label>
      <button disabled={busy}>{busy ? "Saving…" : "Create coupon"}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.note} role="status">{message}</p>}
    <div className={styles.conversationToolbar}><p className={styles.help}>Fixed-rand discounts. Usage counts customers with successful payments.</p><button className={styles.refresh} disabled={busy} onClick={() => void load()}>Refresh coupons ↻</button></div>
    {coupons === null ? !error && <p role="status">Loading coupons…</p> : !coupons.length ? <p>No coupon codes yet.</p> : <div className={styles.couponList}>{coupons.map(coupon => <article key={coupon.code} className={styles.couponCard}>
      <div><strong>{coupon.code}</strong><span className={styles.date}>{coupon.active ? "Active" : "Inactive"}</span></div>
      <dl><div><dt>Amount off</dt><dd>{formatMoney(coupon.amount)}</dd></div><div><dt>Customers used</dt><dd>{coupon.uses}</dd></div><div><dt>Uses left</dt><dd>{Math.max(0, coupon.maxUses - coupon.redeemed - coupon.held)} / {coupon.maxUses}</dd>{coupon.held > 0 && <span className={styles.date}>{coupon.held} in checkout</span>}</div></dl>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void toggle(coupon)} aria-label={`${coupon.active ? "Deactivate" : "Activate"} ${coupon.code}`}>{coupon.active ? "Deactivate" : "Activate"}</button>
    </article>)}</div>}
  </section>;
}
