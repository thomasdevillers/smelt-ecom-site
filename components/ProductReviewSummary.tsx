import type { ReviewSummary } from "@/lib/reviews";
import styles from "@/app/product/product.module.css";

export default function ProductReviewSummary({ summary }: { summary: ReviewSummary | null }) {
  if (!summary || summary.total <= 0) return null;

  return (
    <a className={styles.reviewSummary} href="#reviews">
      <span className={styles.reviewStar} aria-hidden="true">★</span>
      <strong>{summary.average.toFixed(1)}/5</strong>
      <span>from {summary.total} verified {summary.total === 1 ? "review" : "reviews"}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
