"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewRecord, ReviewStatus } from "@/lib/reviews";
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

  return <section className={styles.reviewAdmin}>
    <div className={styles.reviewToolbar}>
      <nav className={styles.sections} aria-label="Review sections">
        {(["pending", "published", "rejected"] as ReviewStatus[]).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
      </nav>
      <div><button className={styles.refresh} disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh ↻"}</button><a className={styles.exportLink} href="/api/admin/reviews?status=all&export=1">Export JSON ↓</a></div>
    </div>
    <p className={styles.help}>Only approved reviews appear on the product page. Rejecting a submission removes its stored photos.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <div className={styles.loading} role="status">Loading reviews…</div> : reviews.length === 0 ? <div className={styles.empty}><h2>No {status} reviews</h2><p>{status === "pending" ? "New customer submissions will wait here for approval." : `There are no ${status} reviews.`}</p></div> : <div className={styles.reviewList}>
      {reviews.map(review => <article className={styles.reviewAdminCard} key={review.id}>
        <div className={styles.reviewMeta}><span>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</span><b>Verified purchase</b><small>{formatDate(review.submittedAt)}</small></div>
        <blockquote>{review.body}</blockquote>
        <div className={styles.reviewIdentity}><strong>{review.anonymous ? "Anonymous" : review.displayName}</strong><span>{review.customerEmail}</span><code>{review.orderReference}</code></div>
        {review.photos.length > 0 && <div className={styles.reviewAdminPhotos}>{review.photos.map(photo => <figure key={photo.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Customer-submitted review" />
          <button type="button" disabled={busy === review.id} onClick={() => void removePhoto(review.id, photo.url)}>Remove photo</button>
        </figure>)}</div>}
        <div className={styles.reviewActions}>
          {status !== "published" && <button type="button" disabled={busy === review.id} onClick={() => void moderate(review.id, "published")}>{busy === review.id ? "Updating…" : "Approve & publish ✓"}</button>}
          {status !== "rejected" && <button type="button" className={styles.secondary} disabled={busy === review.id} onClick={() => void moderate(review.id, "rejected")}>{busy === review.id ? "Updating…" : "Reject"}</button>}
        </div>
      </article>)}
    </div>}
  </section>;
}
