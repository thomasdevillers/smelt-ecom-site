"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicReview, ReviewSummary } from "@/lib/reviews";
import styles from "./ProductReviews.module.css";
import ctaStyles from "./ReviewAccessCta.module.css";

type ReviewsResponse = { reviews: PublicReview[]; summary: ReviewSummary };

function Stars({ rating }: { rating: number }) {
  return <span className={styles.stars} aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map(star => <span key={star} className={star <= Math.round(rating) ? styles.starOn : ""} aria-hidden="true">★</span>)}</span>;
}

const colourLabel = (colours: PublicReview["colours"]) => colours.length === 2
  ? "Forest Green + Natural Cream"
  : colours[0] === "cream" ? "Natural Cream" : "Forest Green";

export default function ProductReviews() {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/reviews", { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<ReviewsResponse> : null)
      .then(result => { if (live && result) setData(result); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!activePhoto) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setActivePhoto(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activePhoto]);

  useEffect(() => {
    if (!data || window.location.hash !== "#reviews") return;
    requestAnimationFrame(() => document.getElementById("reviews")?.scrollIntoView());
  }, [data]);

  return <section id="reviews" className={styles.section} aria-labelledby="reviews-heading">
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>WORN, WARMED, REVIEWED</span>
        <h2 id="reviews-heading">From the benches.</h2>
      </div>
      {data?.summary.total ? <div className={styles.score}>
        <strong>{data.summary.average.toFixed(1)}</strong>
        <div><Stars rating={data.summary.average} /><span>{data.summary.total} verified {data.summary.total === 1 ? "review" : "reviews"}</span></div>
      </div> : null}
    </div>

    <div className={ctaStyles.writeReview}>
      <div><span>OWN A SMELT?</span><strong>Put your sauna sessions on record.</strong><p>Leave an honest verified review and get R50 off your next order. Every rating qualifies.</p></div>
      <Link href="/review">Write a review →</Link>
    </div>

    {data?.summary.total ? <><div className={styles.breakdown} aria-label="Rating breakdown">
      {[5, 4, 3, 2, 1].map(rating => <div key={rating}>
        <span>{rating}★</span>
        <div aria-hidden="true"><i style={{ width: `${data.summary.total ? data.summary.distribution[rating as 1 | 2 | 3 | 4 | 5] / data.summary.total * 100 : 0}%` }} /></div>
        <b>{data.summary.distribution[rating as 1 | 2 | 3 | 4 | 5]}</b>
      </div>)}
    </div>
    <div className={styles.grid}>
      {data.reviews.map(review => <article className={styles.card} key={review.id}>
        <div className={styles.cardTop}><Stars rating={review.rating} /><span>{review.incentivized ? "Verified purchase · R50 thank-you" : "Verified purchase ✓"}</span></div>
        <p className={styles.body}>&ldquo;{review.body}&rdquo;</p>
        {review.photos.length > 0 && <div className={styles.photos}>
          {review.photos.map(photo => <button type="button" key={photo.url} onClick={() => setActivePhoto(photo.url)} aria-label={`Open photo from ${review.displayName}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Smelt hat shared by ${review.displayName}`} loading="lazy" />
          </button>)}
        </div>}
        <footer><strong>{review.displayName}</strong><span>{colourLabel(review.colours)} · {new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" }).format(new Date(review.publishedAt))}</span></footer>
      </article>)}
    </div></> : data ? <p className={ctaStyles.empty}>No reviews yet. Verified buyers can be the first to share their experience.</p> : <p className={ctaStyles.empty} role="status">Loading reviews…</p>}

    {activePhoto && <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Customer review photo" onClick={() => setActivePhoto(null)}>
      <button type="button" onClick={() => setActivePhoto(null)} aria-label="Close photo">Close ×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={activePhoto} alt="Customer-submitted Smelt hat" onClick={event => event.stopPropagation()} />
    </div>}
  </section>;
}
