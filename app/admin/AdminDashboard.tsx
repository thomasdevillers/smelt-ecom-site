"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminOrder, OrdersPage, ShippingReceipt } from "@/lib/admin/types";
import AnalyticsPanel from "./AnalyticsPanel";
import WaybillScanner from "./WaybillScanner";
import RestockPanel from "./RestockPanel";
import { preorderTiming } from "@/lib/legacyPreorders";
import ReviewsPanel from "./ReviewsPanel";
import { reviewWhatsAppUrl } from "@/lib/whatsapp";
import styles from "./admin.module.css";
import { attributionLabel } from "@/lib/attribution";

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new RequestError(body.error || "Something went wrong. Please try again.", response.status);
  return body;
}
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date(value)) : "Date unavailable";
}
function money(order: AdminOrder) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: /^[A-Z]{3}$/.test(order.currency) ? order.currency : "ZAR" }).format(order.amount / 100);
}
function status(receipt: ShippingReceipt | null) {
  if (!receipt) return "Ready to notify";
  if (receipt.status === "pending") return "Send unconfirmed";
  const labels: Record<string, string> = { delivered: "Email delivered", opened: "Email opened", clicked: "Email clicked", bounced: "Email bounced", complained: "Marked as spam", failed: "Email failed", delivery_delayed: "Delivery delayed", suppressed: "Email suppressed", sent: "Email sent" };
  return labels[receipt.lastEvent || ""] || "Email accepted";
}
function ReviewInvite({ reference, customerName, phone, sentAt, onSent, onExpired }: { reference: string; customerName: string; phone?: string; sentAt: string | null; onSent: (sentAt: string) => void; onExpired: () => void }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [photosRequired, setPhotosRequired] = useState(true);
  const [message, setMessage] = useState("");
  async function markSent() {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ reviewMessageSentAt: string }>("reviews", { method: "PATCH", body: JSON.stringify({ reference, action: "markMessageSent" }) });
      onSent(result.reviewMessageSentAt);
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) onExpired();
      setMessage(caught instanceof Error ? caught.message : "Could not save the sent date. Please try again.");
    } finally { setBusy(false); }
  }
  async function create(requirePhotos: boolean) {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ reviewUrl: string; photosRequired: boolean }>("reviews", { method: "POST", body: JSON.stringify({ reference, photosRequired: requirePhotos }) });
      setUrl(result.reviewUrl);
      setPhotosRequired(result.photosRequired);
      try { await navigator.clipboard.writeText(result.reviewUrl); setMessage("New link copied. It replaces any older review link for this order."); }
      catch { setMessage("New link created. Copy it below."); }
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) onExpired();
      setMessage(caught instanceof Error ? caught.message : "Could not create a review link.");
    } finally { setBusy(false); }
  }
  const whatsappUrl = url && phone ? reviewWhatsAppUrl({ phone, customerName, reviewUrl: url, photosRequired }) : null;
  return <div className={styles.reviewInvite}>
    <button type="button" className={styles.secondary} disabled={busy} onClick={() => void create(true)}>{busy ? "Please wait…" : "Create review link (photos required)"}</button>
    <button type="button" className={styles.secondary} disabled={busy} onClick={() => void create(false)}>{busy ? "Please wait…" : "Create review link (photos optional)"}</button>
    {url && <p className={styles.note}>{photosRequired ? "Photos required for this link." : "Photos optional for this link. R50 back per hat, with or without photos."}</p>}
    {url && <div><input aria-label="Review invitation link" readOnly value={url} onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage("Link copied."), () => setMessage("Select and copy the link manually."))}>Copy</button></div>}
    {whatsappUrl && <a className={styles.whatsappLink} href={whatsappUrl} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${customerName || "customer"} with their review link`}>WhatsApp customer ↗</a>}
    {url && !whatsappUrl && <p className={styles.note}>No valid customer phone number is available for WhatsApp.</p>}
    {!sentAt && <>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void markSent()}>{busy ? "Saving…" : "Mark review message sent"}</button>
      <p className={styles.note}>Mark this after you send the message in WhatsApp.</p>
    </>}
    {message && <p className={styles.note} role="status">{message}</p>}
  </div>;
}
export function OrderRow({ order, onReceipt, onExpired, onMoved, onReviewMessageSent }: { order: AdminOrder; onReceipt: (receipt: ShippingReceipt) => void; onExpired: () => void; onMoved: () => void; onReviewMessageSent: (sentAt: string) => void }) {
  const [waybill, setWaybill] = useState(order.receipt?.trackingNumber || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const receipt = order.receipt;
  const accepted = receipt?.status === "accepted";
  const hasHistory = order.history.length > 0;
  const [scanning, setScanning] = useState(false);
  async function run(refresh: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ receipt: ShippingReceipt | null }>(refresh ? `shipping?reference=${encodeURIComponent(order.reference)}` : "shipping", refresh ? undefined : { method: "POST", body: JSON.stringify({ reference: order.reference, trackingNumber: receipt?.trackingNumber || waybill.trim() }) });
      if (result.receipt) { onReceipt(result.receipt); setWaybill(result.receipt.trackingNumber); }
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "Could not send. Refresh the status before retrying.");
    } finally { setBusy(false); }
  }
  async function moveOrder(completed: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api("orders", { method: "PATCH", body: JSON.stringify({ reference: order.reference, completed }) });
      onMoved();
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "Could not update this order. Please try again.");
    } finally { setBusy(false); }
  }
  const address = order.address;
  return <article className={styles.order} aria-label={`Order for ${order.email}`}>
    <div className={styles.customer}>
      <span className={styles.date}>{date(order.paidAt)}</span>
      <h2>{order.name || order.email.split("@")[0] || "Customer"}</h2>
      <a href={`mailto:${order.email}`} className={styles.email}>{order.email || "No email recorded"}</a>
      <p className={styles.note}><strong>Source:</strong> {attributionLabel(order.attribution?.lastTouch)}</p>
      <details className={styles.details}><summary>Order & delivery details</summary>
        <p className={styles.reference}>Reference: {order.reference}</p>
        <p>{[address.company, address.addressLine2, address.line1, address.suburb, address.city, address.province, address.postalCode, address.country].filter(Boolean).join(", ")}</p>
        {address.phone && <p><a href={`tel:${address.phone}`}>{address.phone}</a></p>}
        <p>{order.shippingMethod === "aramex" ? "Express shipping · Aramex" : order.shippingMethod === "founders" ? "Hand delivered by founders" : order.shippingMethod}</p>
      </details>
    </div>
    <div className={styles.items}>
      {order.preorder && <p className={styles.notice}><strong>PAID PRE-ORDER</strong><br />{preorderTiming(order.preorder)}<br />Historical order timing.</p>}
      {order.items.length ? order.items.map((item, i) => <p key={i}><span className={`${styles.swatch} ${item.colour === "cream" ? styles.cream : ""}`} aria-hidden="true" />{item.qty} × {item.name}</p>) : <p>Items unavailable</p>}
      <strong>{money(order)}</strong><span className={styles.paid}>Paid</span>
    </div>
    <div className={styles.fulfilment}>
      <div className={`${styles.badge} ${accepted ? styles.accepted : ""}`} aria-live="polite">{order.completedAt ? "Completed" : accepted ? status(receipt) : order.canShip || receipt ? status(receipt) : "Needs review"}</div>
      {order.reviewMessageSentAt && <p className={styles.note} role="status"><strong>Review message sent</strong> · <time dateTime={order.reviewMessageSentAt}>{date(order.reviewMessageSentAt)}</time></p>}
      {hasHistory && <details className={styles.history}><summary>{order.history.length} previous shipping {order.history.length === 1 ? "email" : "emails"} to this customer</summary>
        <p>These emails belong to previous shipments. This order needs its own waybill and shipping email.</p>
        {order.history.map(r => <p key={r.id || r.trackingNumber}><strong>{r.trackingNumber}</strong> · {date(r.acceptedAt || null)} · {r.status === "accepted" ? "Email accepted" : "Unconfirmed"}</p>)}
      </details>}
      {order.completedAt ? <div className={styles.completionActions}>
        <p className={styles.note}>Completed {date(order.completedAt)}</p>
        <button className={styles.secondary} type="button" disabled={busy} onClick={() => void moveOrder(false)}>{busy ? "Moving…" : "Reopen order"}</button>
        <ReviewInvite reference={order.reference} customerName={order.name} phone={address.phone} sentAt={order.reviewMessageSentAt} onSent={onReviewMessageSent} onExpired={onExpired} />
      </div> : accepted ? <div className={styles.completionActions}>
        <button type="button" disabled={busy} onClick={() => void moveOrder(true)}>{busy ? "Updating…" : "Mark complete ✓"}</button>
        <button className={styles.secondary} type="button" disabled={busy} onClick={() => void run(true)}>Check email status</button>
      </div> : order.canShip || receipt ? <form onSubmit={e => { e.preventDefault(); void run(false); }}>
        <label htmlFor={`waybill-${order.reference}`}>Aramex waybill number</label>
        <div className={styles.sendRow}>
          <div className={styles.waybillField}>
            <input id={`waybill-${order.reference}`} inputMode="numeric" autoComplete="off" placeholder="Paste or scan waybill number" pattern="[0-9]{6,30}" maxLength={30} required value={receipt?.trackingNumber || waybill} readOnly={!!receipt} disabled={busy} onChange={e => setWaybill(e.target.value)} />
            {!receipt && <button className={styles.scanButton} type="button" disabled={busy} title="Scan the waybill barcode with your camera" aria-label="Scan the waybill barcode with your camera" onClick={() => setScanning(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5V7a2 2 0 0 1 2-2h1.6a1 1 0 0 0 .8-.4l.7-1a1 1 0 0 1 .8-.4h4.2a1 1 0 0 1 .8.4l.7 1a1 1 0 0 0 .8.4H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5" /><circle cx="12" cy="12.5" r="3.5" /></svg>
            </button>}
          </div>
          <button type="submit" disabled={busy || !waybill.trim()}>{busy ? "Sending…" : receipt ? "Retry safely" : "Send email ↗"}</button>
        </div>
        {scanning && <WaybillScanner onScan={value => { setWaybill(value); setScanning(false); setError(""); }} onClose={() => setScanning(false)} />}
      </form> : <p className={styles.note}>{order.reviewReason}</p>}
      {accepted && <p className={styles.note}>Sent {date(receipt.acceptedAt || null)} · <a target="_blank" rel="noreferrer" href={`https://www.aramex.com/ai/en/track/results?source=aramex&ShipmentNumber=${encodeURIComponent(receipt.trackingNumber)}`}>Track shipment ↗</a></p>}
      {receipt?.status === "pending" && <p className={styles.note}>Keep this waybill unchanged while the send is checked.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </article>;
}
export default function AdminDashboard() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<OrdersPage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "completed">("active");
  const [completedSort, setCompletedSort] = useState<"newest" | "oldest">("newest");
  const [section, setSection] = useState<"orders" | "analytics" | "reviews" | "restock">("orders");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const expire = useCallback(() => { generation.current++; setAuth(false); setData(null); setError("Your session has ended. Sign in again to continue."); }, []);
  useEffect(() => { let active = true; api<{ authenticated: boolean }>("session").then(r => { if (active) setAuth(r.authenticated); }).catch(e => { if (active) { setAuth(false); setError(e.message); } }); return () => { active = false; }; }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(""); setData(null);
    try {
      const result = await api<OrdersPage>(`orders?page=${page}&view=${view}&sort=${completedSort}&search=${encodeURIComponent(search)}`);
      if (generation.current === current) setData(result);
    } catch (e) {
      if (generation.current !== current) return;
      if (e instanceof RequestError && e.status === 401) expire();
      else setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally { if (generation.current === current) setLoading(false); }
  }, [page, search, view, completedSort, expire]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active && auth && section === "orders") void load(); });
    return () => { active = false; invalidate(); };
  }, [auth, section, load, invalidate]);
  async function signIn(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await api("session", { method: "POST", body: JSON.stringify({ password }) }); setPassword(""); setAuth(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { await api("session", { method: "DELETE" }); generation.current++; setAuth(false); setData(null); setError(""); }
    catch { setError("Could not sign out. Please try again."); }
    finally { setBusy(false); }
  }
  async function exportOrders() {
    setExporting(true); setExportError("");
    try {
      const response = await fetch("/api/admin/orders/export", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new RequestError(body.error || "Could not export orders. Please try again.", response.status);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "smelt-orders.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) expire();
      else setExportError(caught instanceof Error ? caught.message : "Could not export orders. Please try again.");
    } finally { setExporting(false); }
  }
  const sectionCopy = {
    orders: { eyebrow: "SMELT / FULFILMENT", title: <>The dispatch desk<span>.</span></>, description: "Paste a waybill. Send the good news." },
    analytics: { eyebrow: "SMELT / COMMERCE", title: <>Store performance<span>.</span></>, description: "Traffic, intent and verified sales in one view." },
    restock: { eyebrow: "SMELT / NEXT BATCH", title: <>Restock requests<span>.</span></>, description: "WhatsApp requests by colour." },
    reviews: { eyebrow: "SMELT / CUSTOMER PROOF", title: <>Reviews, reviewed<span>.</span></>, description: "Approve the real thing. Publish only what customers sent." },
  }[section];
  return <div className={styles.shell}>
    <header className={styles.topbar}><Link href="/" className={styles.wordmark}>smelt<span>®</span></Link><span className={styles.privateLabel}>THE BACK OFFICE</span>{auth && <button className={styles.logout} disabled={busy} onClick={() => void signOut()}>Sign out ↗</button>}</header>
    <main className={styles.main}>
      {auth === null ? <p className={styles.loading} role="status">Opening the dispatch desk…</p> : !auth ? <section className={styles.login}>
        <span className={styles.eyebrow}>SMELT / TEAM ACCESS</span><h1>Good things.<br />In clear view.</h1><p>Sign in to manage orders and see how the store is performing.</p>
        <form onSubmit={signIn}><label htmlFor="admin-password">Admin password</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /><button disabled={busy}>{busy ? "Signing in…" : "Open dispatch desk ↗"}</button></form>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section> : <>
        <section className={styles.heading}><div><span className={styles.eyebrow}>{sectionCopy.eyebrow}</span><h1>{sectionCopy.title}</h1><p>{sectionCopy.description}</p></div>{section === "orders" ? <div className={styles.total}><strong>{data?.total ?? "—"}</strong><span>{view === "completed" ? "COMPLETED ORDERS" : "ACTIVE ORDERS"}</span></div> : section === "analytics" ? <div className={styles.analyticsStamp}><span>VERCEL</span><b>＋</b><span>PAYSTACK</span></div> : <div className={styles.analyticsStamp}><span>PAYSTACK</span><b>＋</b><span>BLOB</span></div>}</section>
        <nav className={styles.primarySections} aria-label="Admin sections">
          <button type="button" aria-pressed={section === "orders"} onClick={() => setSection("orders")}>Orders</button>
          <button type="button" aria-pressed={section === "analytics"} onClick={() => setSection("analytics")}>Store performance</button>
          <button type="button" aria-pressed={section === "reviews"} onClick={() => setSection("reviews")}>Reviews</button>
          <button type="button" aria-pressed={section === "restock"} onClick={() => setSection("restock")}>Restock requests</button>
        </nav>
        {section === "orders" ? <>

        <nav className={styles.sections} aria-label="Order sections">
          <button type="button" aria-pressed={view === "active"} onClick={() => { setView("active"); setPage(1); setNotice(""); }}>Active orders {data && <span>{data.activeTotal}</span>}</button>
          <button type="button" aria-pressed={view === "completed"} onClick={() => { setView("completed"); setPage(1); setNotice(""); }}>Completed orders {data && <span>{data.completedTotal}</span>}</button>
        </nav>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <div className={styles.toolbar}><form onSubmit={e => { e.preventDefault(); setPage(1); if (search === query.trim() && page === 1) void load(); else setSearch(query.trim()); }}><label className={styles.srOnly} htmlFor="order-search">Search by customer name, email or order reference</label><input id="order-search" type="search" placeholder="Name, email or order reference" value={query} onChange={e => setQuery(e.target.value)} /><button disabled={loading}>Search</button>{search && <button type="button" className={styles.secondary} onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Clear</button>}</form><div className={styles.orderActions}>{view === "completed" && <label className={styles.sortControl} htmlFor="completed-order-sort"><span>Sort completed</span><select id="completed-order-sort" value={completedSort} disabled={loading} onChange={e => { setCompletedSort(e.target.value as "newest" | "oldest"); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>}<button type="button" className={styles.secondary} disabled={exporting} onClick={() => void exportOrders()}>{exporting ? "Exporting…" : "Export all orders CSV ↓"}</button><button className={styles.refresh} disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh orders ↻"}</button></div></div>
        <p className={styles.note}>CSV includes all paid orders across every page, including completed orders, regardless of the current search. Amounts include delivery and any discounts. Paystack fees are included where available; refunds and bank payouts are not included.</p>
        {exporting && <p className={styles.note} role="status">Preparing your order export…</p>}
        {exportError && <p className={styles.error} role="alert">{exportError}</p>}
        <p className={styles.help}>{view === "completed" ? `Completed orders, ${completedSort === "oldest" ? "oldest" : "most recently"} completed first. Reopen an order to move it back to active orders.` : "Send tracking and mark complete, or review an accepted previous shipping email and complete the order without sending again."}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <div className={styles.loading} role="status">Loading orders…</div>}
        {data && <><div className={styles.columnHead}><span>CUSTOMER / ORDER</span><span>IN THE BAG</span><span>TRACKING & EMAIL</span></div>
          <div className={styles.orders}>{data.orders.map(order => <OrderRow key={order.reference} order={order} onExpired={expire} onMoved={() => { setNotice(view !== "completed" ? "Order moved to Completed orders." : "Order moved back to Active orders."); if (data.orders.length === 1 && data.page > 1) setPage(data.page - 1); else void load(); }} onReceipt={receipt => setData(current => current ? { ...current, orders: current.orders.map(o => o.reference === order.reference ? { ...o, receipt } : o) } : null)} onReviewMessageSent={reviewMessageSentAt => setData(current => current ? { ...current, orders: current.orders.map(o => o.reference === order.reference ? { ...o, reviewMessageSentAt } : o) } : null)} />)}</div>
          {!data.orders.length && <div className={styles.empty}><h2>{search ? "No matching orders" : view === "completed" ? "No completed orders yet" : "All caught up"}</h2><p>{search ? "Search using all or part of a customer name, email address or payment reference." : view === "completed" ? "Orders appear here after you mark them complete." : "New paid orders will appear here."}</p></div>}
          <nav className={styles.pagination} aria-label="Order pages"><span>{data.total ? `Page ${data.page} of ${Math.max(1, data.pageCount)}` : "0 orders"}</span><div><button className={styles.secondary} disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>← Previous</button><button className={styles.secondary} disabled={loading || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Next →</button></div></nav></>}
        </> : section === "analytics" ? <AnalyticsPanel onExpired={expire} /> : section === "restock" ? <RestockPanel onExpired={expire} /> : <ReviewsPanel onExpired={expire} />}
        <footer className={styles.footnote}>Made with care. Measured with care.<span>{section === "orders" ? "Email delivery status refers to the notification, not the parcel." : section === "analytics" ? "Payment totals come from successful Paystack transactions." : "Customer reviews remain private until approved."}</span></footer>
      </>}
    </main>
  </div>;
}
