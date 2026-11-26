"use client";
import { useState } from "react";
import type { AdminOrder, ShippingReceipt } from "@/lib/admin/types";
import { preorderTiming } from "@/lib/inventory/preorders";
import { reviewWhatsAppUrl } from "@/lib/whatsapp";
import { attributionLabel } from "@/lib/attribution";
import { api, RequestError } from "@/lib/admin/client";
import WaybillScanner from "./WaybillScanner";
import styles from "./admin.module.css";
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
      }).format(new Date(value))
    : "Date unavailable";
}
function money(order: AdminOrder) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(order.currency) ? order.currency : "ZAR",
  }).format(order.amount / 100);
}
function status(receipt: ShippingReceipt | null) {
  if (!receipt) return "Ready to notify";
  if (receipt.status === "pending") return "Send unconfirmed";
  const labels: Record<string, string> = {
    delivered: "Email delivered",
    opened: "Email opened",
    clicked: "Email clicked",
    bounced: "Email bounced",
    complained: "Marked as spam",
    failed: "Email failed",
    delivery_delayed: "Delivery delayed",
    suppressed: "Email suppressed",
    sent: "Email sent",
  };
  return labels[receipt.lastEvent || ""] || "Email accepted";
}
function ReviewInvite({
  reference,
  customerName,
  phone,
  sentAt,
  onSent,
  onExpired,
}: {
  reference: string;
  customerName: string;
  phone?: string;
  sentAt: string | null;
  onSent: (sentAt: string) => void;
  onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [photosRequired, setPhotosRequired] = useState(true);
  const [message, setMessage] = useState("");
  async function markSent() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ reviewMessageSentAt: string }>("reviews", {
        method: "PATCH",
        body: JSON.stringify({ reference, action: "markMessageSent" }),
      });
      onSent(result.reviewMessageSentAt);
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) onExpired();
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not save the sent date. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function create(requirePhotos: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ reviewUrl: string; photosRequired: boolean }>("reviews", {
        method: "POST",
        body: JSON.stringify({ reference, photosRequired: requirePhotos }),
      });
      setUrl(result.reviewUrl);
      setPhotosRequired(result.photosRequired);
      try {
        await navigator.clipboard.writeText(result.reviewUrl);
        setMessage("New link copied. It replaces any older review link for this order.");
      } catch {
        setMessage("New link created. Copy it below.");
      }
    } catch (caught) {
      if (caught instanceof RequestError && caught.status === 401) onExpired();
      setMessage(caught instanceof Error ? caught.message : "Could not create a review link.");
    } finally {
      setBusy(false);
    }
  }
  const whatsappUrl =
    url && phone
      ? reviewWhatsAppUrl({ phone, customerName, reviewUrl: url, photosRequired })
      : null;
  return (
    <div className={styles.reviewInvite}>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={() => void create(true)}
      >
        {busy ? "Please wait…" : "Create review link (photos required)"}
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={() => void create(false)}
      >
        {busy ? "Please wait…" : "Create review link (photos optional)"}
      </button>
      {url && (
        <p className={styles.note}>
          {photosRequired
            ? "Photos required for this link."
            : "Photos optional for this link. R50 back per hat, with or without photos."}
        </p>
      )}
      {url && (
        <div>
          <input
            aria-label="Review invitation link"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(
                () => setMessage("Link copied."),
                () => setMessage("Select and copy the link manually."),
              )
            }
          >
            Copy
          </button>
        </div>
      )}
      {whatsappUrl && (
        <a
          className={styles.whatsappLink}
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`WhatsApp ${customerName || "customer"} with their review link`}
        >
          WhatsApp customer ↗
        </a>
      )}
      {url && !whatsappUrl && (
        <p className={styles.note}>No valid customer phone number is available for WhatsApp.</p>
      )}
      {!sentAt && (
        <>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => void markSent()}
          >
            {busy ? "Saving…" : "Mark review message sent"}
          </button>
          <p className={styles.note}>Mark this after you send the message in WhatsApp.</p>
        </>
      )}
      {message && (
        <p className={styles.note} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
export function OrderRow({
  order,
  onReceipt,
  onExpired,
  onMoved,
  onReviewMessageSent,
}: {
  order: AdminOrder;
  onReceipt: (receipt: ShippingReceipt) => void;
  onExpired: () => void;
  onMoved: () => void;
  onReviewMessageSent: (sentAt: string) => void;
}) {
  const [waybill, setWaybill] = useState(order.receipt?.trackingNumber || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const receipt = order.receipt;
  const accepted = receipt?.status === "accepted";
  const hasHistory = order.history.length > 0;
  const [scanning, setScanning] = useState(false);
  async function run(refresh: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ receipt: ShippingReceipt | null }>(
        refresh ? `shipping?reference=${encodeURIComponent(order.reference)}` : "shipping",
        refresh
          ? undefined
          : {
              method: "POST",
              body: JSON.stringify({
                reference: order.reference,
                trackingNumber: receipt?.trackingNumber || waybill.trim(),
              }),
            },
      );
      if (result.receipt) {
        onReceipt(result.receipt);
        setWaybill(result.receipt.trackingNumber);
      }
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) onExpired();
      setError(
        e instanceof Error ? e.message : "Could not send. Refresh the status before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function moveOrder(completed: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("orders", {
        method: "PATCH",
        body: JSON.stringify({ reference: order.reference, completed }),
      });
      onMoved();
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "Could not update this order. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const address = order.address;
  return (
    <article className={styles.order} aria-label={`Order for ${order.email}`}>
      <div className={styles.customer}>
        <span className={styles.date}>{date(order.paidAt)}</span>
        <h2>{order.name || order.email.split("@")[0] || "Customer"}</h2>
        <a href={`mailto:${order.email}`} className={styles.email}>
          {order.email || "No email recorded"}
        </a>
        <p className={styles.note}>
          <strong>Source:</strong> {attributionLabel(order.attribution?.lastTouch)}
        </p>
        <details className={styles.details}>
          <summary>Order & delivery details</summary>
          <p className={styles.reference}>Reference: {order.reference}</p>
          <p>
            {[
              address.company,
              address.addressLine2,
              address.line1,
              address.suburb,
              address.city,
              address.province,
              address.postalCode,
              address.country,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          {address.phone && (
            <p>
              <a href={`tel:${address.phone}`}>{address.phone}</a>
            </p>
          )}
          <p>
            {order.shippingMethod === "aramex"
              ? "Express shipping · Aramex"
              : order.shippingMethod === "founders"
                ? "Hand delivered by founders"
                : order.shippingMethod}
          </p>
        </details>
      </div>
      <div className={styles.items}>
        {order.preorder && (
          <p className={styles.notice}>
            <strong>PAID PRE-ORDER</strong>
            <br />
            {preorderTiming(order.preorder)}
            <br />
            Allocate ahead of general sales; dispatch in payment order within each colour.
          </p>
        )}
        {order.items.length ? (
          order.items.map((item, i) => (
            <p key={i}>
              <span
                className={`${styles.swatch} ${item.colour === "cream" ? styles.cream : ""}`}
                aria-hidden="true"
              />
              {item.qty} × {item.name}
            </p>
          ))
        ) : (
          <p>Items unavailable</p>
        )}
        <strong>{money(order)}</strong>
        <span className={styles.paid}>Paid</span>
      </div>
      <div className={styles.fulfilment}>
        <div className={`${styles.badge} ${accepted ? styles.accepted : ""}`} aria-live="polite">
          {order.completedAt
            ? "Completed"
            : accepted
              ? status(receipt)
              : order.canShip || receipt
                ? status(receipt)
                : "Needs review"}
        </div>
        {order.reviewMessageSentAt && (
          <p className={styles.note} role="status">
            <strong>Review message sent</strong> ·{" "}
            <time dateTime={order.reviewMessageSentAt}>{date(order.reviewMessageSentAt)}</time>
          </p>
        )}
        {hasHistory && (
          <details className={styles.history}>
            <summary>
              {order.history.length} previous shipping{" "}
              {order.history.length === 1 ? "email" : "emails"} to this customer
            </summary>
            <p>
              These emails belong to previous shipments. This order needs its own waybill and
              shipping email.
            </p>
            {order.history.map((r) => (
              <p key={r.id || r.trackingNumber}>
                <strong>{r.trackingNumber}</strong> · {date(r.acceptedAt || null)} ·{" "}
                {r.status === "accepted" ? "Email accepted" : "Unconfirmed"}
              </p>
            ))}
          </details>
        )}
        {order.completedAt ? (
          <div className={styles.completionActions}>
            <p className={styles.note}>Completed {date(order.completedAt)}</p>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => void moveOrder(false)}
            >
              {busy ? "Moving…" : "Reopen order"}
            </button>
            <ReviewInvite
              reference={order.reference}
              customerName={order.name}
              phone={address.phone}
              sentAt={order.reviewMessageSentAt}
              onSent={onReviewMessageSent}
              onExpired={onExpired}
            />
          </div>
        ) : accepted ? (
          <div className={styles.completionActions}>
            <button type="button" disabled={busy} onClick={() => void moveOrder(true)}>
              {busy ? "Updating…" : "Mark complete ✓"}
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => void run(true)}
            >
              Check email status
            </button>
          </div>
        ) : order.canShip || receipt ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(false);
            }}
          >
            <label htmlFor={`waybill-${order.reference}`}>Aramex waybill number</label>
            <div className={styles.sendRow}>
              <div className={styles.waybillField}>
                <input
                  id={`waybill-${order.reference}`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Paste or scan waybill number"
                  pattern="[0-9]{6,30}"
                  maxLength={30}
                  required
                  value={receipt?.trackingNumber || waybill}
                  readOnly={!!receipt}
                  disabled={busy}
                  onChange={(e) => setWaybill(e.target.value)}
                />
                {!receipt && (
                  <button
                    className={styles.scanButton}
                    type="button"
                    disabled={busy}
                    title="Scan the waybill barcode with your camera"
                    aria-label="Scan the waybill barcode with your camera"
                    onClick={() => setScanning(true)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 8.5V7a2 2 0 0 1 2-2h1.6a1 1 0 0 0 .8-.4l.7-1a1 1 0 0 1 .8-.4h4.2a1 1 0 0 1 .8.4l.7 1a1 1 0 0 0 .8.4H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5" />
                      <circle cx="12" cy="12.5" r="3.5" />
                    </svg>
                  </button>
                )}
              </div>
              <button type="submit" disabled={busy || !waybill.trim()}>
                {busy ? "Sending…" : receipt ? "Retry safely" : "Send email ↗"}
              </button>
            </div>
            {scanning && (
              <WaybillScanner
                onScan={(value) => {
                  setWaybill(value);
                  setScanning(false);
                  setError("");
                }}
                onClose={() => setScanning(false)}
              />
            )}
          </form>
        ) : (
          <p className={styles.note}>{order.reviewReason}</p>
        )}
        {accepted && (
          <p className={styles.note}>
            Sent {date(receipt.acceptedAt || null)} ·{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://www.aramex.com/ai/en/track/results?source=aramex&ShipmentNumber=${encodeURIComponent(receipt.trackingNumber)}`}
            >
              Track shipment ↗
            </a>
          </p>
        )}
        {receipt?.status === "pending" && (
          <p className={styles.note}>Keep this waybill unchanged while the send is checked.</p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
