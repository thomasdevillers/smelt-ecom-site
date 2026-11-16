"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewRecord, ReviewStatus } from "@/lib/reviews";
import { reviewPhotoUrl } from "@/lib/reviews";
import styles from "./admin.module.css";

class ReviewRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/reviews${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new ReviewRequestError(body.error || "Could not update reviews.", response.status);
  return body;
}

const formatDate = (value: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date(value));

export default function ReviewsPanel({ onExpired }: { onExpired: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setReviews((await request<{ reviews: ReviewRecord[] }>(`?status=${status}`)).reviews); }
    catch (caught) {
      if (caught instanceof ReviewRequestError && caught.status === 401) onExpired();
      else setError(caught instanceof Error ? caught.message : "Could not load reviews.");
    } finally { setLoading(false); }
  }, [status, onExpired]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  async function moderate(id: string, next: "published" | "rejected") {
    setBusy(id); setError("");
    try { await request("", { method: "PATCH", body: JSON.stringify({ id, status: next }) }); setReviews(current => current.filter(review => review.id !== id)); }
    catch (caught) { if (caught instanceof ReviewRequestError && caught.status === 401) onExpired(); else setError(caught instanceof Error ? caught.message : "Could not update review."); }
    finally { setBusy(""); }
  }

  async function removePhoto(id: string, url: string) {
    setBusy(id); setError("");
    try {
      const { review } = await request<{ review: ReviewRecord }>("", { method: "PATCH", body: JSON.stringify({ id, action: "removePhoto", url }) });
      setReviews(current => current.map(item => item.id === id ? review : item));
    } catch (caught) { if (caught instanceof ReviewRequestError && caught.status === 401) onExpired(); else setError(caught instanceof Error ? caught.message : "Could not remove photo."); }
    finally { setBusy(""); }
  }

  async function saveText() {
    if (!editing) return;
    const { id, body } = editing;
    setBusy(id); setError("");
    try {
      const { review } = await request<{ review: ReviewRecord }>("", { method: "PATCH", body: JSON.stringify({ id, action: "editText", body }) });
      setReviews(current => current.map(item => item.id === id ? review : item));
      setEditing(null);
    } catch (caught) { if (caught instanceof ReviewRequestError && caught.status === 401) onExpired(); else setError(caught instanceof Error ? caught.message : "Could not save review text."); }
    finally { setBusy(""); }
  }

  return <section className={styles.reviewAdmin}>
    <div className={styles.reviewToolbar}>
      <nav className={styles.sections} aria-label="Review sections">
        {(["pending", "published", "rejected"] as ReviewStatus[]).map(value => <button key={value} type="button" disabled={editing !== null} aria-pressed={status === value} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
      </nav>
      <div><button className={styles.refresh} disabled={loading || editing !== null} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh ↻"}</button><a className={styles.exportLink} href="/api/admin/reviews?status=all&export=1">Export JSON ↓</a></div>
    </div>
    <p className={styles.help}>Only approved reviews appear on the product page. Save text edits before approving; saving does not change approval status. Rejecting a submission removes its stored photos.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <div className={styles.loading} role="status">Loading reviews…</div> : reviews.length === 0 ? <div className={styles.empty}><h2>No {status} reviews</h2><p>{status === "pending" ? "New customer submissions will wait here for approval." : `There are no ${status} reviews.`}</p></div> : <div className={styles.reviewList}>
      {reviews.map(review => <article className={styles.reviewAdminCard} key={review.id}>
        <div className={styles.reviewMeta}><span>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</span><b>Verified purchase</b><small>{formatDate(review.submittedAt)}</small></div>
        {editing?.id === review.id ? <form className={styles.reviewEditor} onSubmit={event => { event.preventDefault(); void saveText(); }}>
          <label htmlFor={`review-text-${review.id}`}>Review text</label>
          <textarea id={`review-text-${review.id}`} value={editing.body} onChange={event => setEditing({ id: review.id, body: event.target.value })} minLength={3} maxLength={1600} required rows={6} disabled={busy === review.id} autoFocus aria-describedby={`review-text-help-${review.id}`} />
          <p className={styles.help} id={`review-text-help-${review.id}`}>{editing.body.trim().length} / 1,600 characters · Saving does not approve the review.</p>
          <div className={styles.reviewActions}>
            <button type="submit" disabled={busy === review.id || editing.body.trim().length < 3}>{busy === review.id ? "Saving…" : "Save text"}</button>
            <button type="button" className={styles.secondary} disabled={busy === review.id} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form> : <blockquote>{review.body}</blockquote>}
        <div className={styles.reviewIdentity}><strong>{review.anonymous ? "Anonymous" : review.displayName}</strong><span>{review.customerEmail}</span><code>{review.orderReference}</code></div>
        {review.rewardType === "manual_refund" && <p className={styles.help}>Manual refund · R50 per hat in this order. Check the order quantity and process the refund to the original payment method. Every rating qualifies; publication is not required.</p>}
        {review.photos.length > 0 && <div className={styles.reviewAdminPhotos}>{review.photos.map((photo, index) => <figure key={photo.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reviewPhotoUrl(review.id, index)} alt="Customer-submitted review" />
          <button type="button" disabled={busy === review.id} onClick={() => void removePhoto(review.id, photo.url)}>Remove photo</button>
        </figure>)}</div>}
        <div className={styles.reviewActions}>
          {editing?.id !== review.id && <button type="button" className={styles.secondary} disabled={busy === review.id || editing !== null} onClick={() => { setError(""); setEditing({ id: review.id, body: review.body }); }}>Edit text</button>}
          {status !== "published" && <button type="button" disabled={busy === review.id || editing?.id === review.id} onClick={() => void moderate(review.id, "published")}>{busy === review.id ? "Updating…" : "Approve & publish ✓"}</button>}
          {status !== "rejected" && <button type="button" className={styles.secondary} disabled={busy === review.id || editing?.id === review.id} onClick={() => void moderate(review.id, "rejected")}>{busy === review.id ? "Updating…" : "Reject"}</button>}
        </div>
      </article>)}
    </div>}
  </section>;
}
