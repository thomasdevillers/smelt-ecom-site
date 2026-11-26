import type { GoogleFeedReview } from "./googleReviewFeed";
import { REVIEW_PRODUCT_ID } from "./reviews";

/** Validate merchant-supplied WhatsApp reviews without inventing metadata. */
export function manualGoogleReviews(input: unknown): GoogleFeedReview[] {
  if (!Array.isArray(input) || !input.length)
    throw new Error("Manual reviews must be a non-empty array.");
  const numbers = new Set<number>();
  return input.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid manual review.");
    const { number, rating, date, name, body, anonymous, incentivized } = value;
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      numbers.has(number) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof body !== "string" ||
      !body.trim() ||
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof anonymous !== "boolean" ||
      typeof incentivized !== "boolean"
    )
      throw new Error("Invalid manual review metadata.");
    const timestamp = `${date}T00:00:00.000Z`;
    if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp)
      throw new Error("Invalid manual review date.");
    numbers.add(number);
    return {
      id: `smelt-manual-review-${number}`,
      productId: REVIEW_PRODUCT_ID,
      source: "manual",
      status: "published",
      publishedAt: timestamp,
      submittedAt: timestamp,
      rating,
      body,
      displayName: name,
      anonymous,
      incentivized,
      // Merchant confirms these were received on WhatsApp from verified buyers.
      verifiedPurchase: true,
      colours: [],
    };
  });
}
