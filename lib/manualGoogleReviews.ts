import type { GoogleFeedReview } from "./googleReviewFeed";
import { REVIEW_PRODUCT_ID } from "./reviews";

/** Parse the numbered review text and matching metadata without inventing names or ratings. */
export function manualGoogleReviews(markdown: string): GoogleFeedReview[] {
  const texts = new Map<number, string>();
  for (const match of markdown.matchAll(/^(\d+)\. “(.+)”\s*$/gm)) {
    const number = Number(match[1]);
    if (texts.has(number)) throw new Error("Duplicate manual review number.");
    texts.set(number, match[2]);
  }
  const result: GoogleFeedReview[] = [];
  const numbers = new Set<number>();
  for (const line of markdown.split("\n")) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const fields = line.split("|").slice(1, -1).map(value => value.trim());
    const [numberText, stars, date, name, anonymous, incentive] = fields;
    const number = Number(numberText);
    const body = texts.get(number);
    if (fields.length !== 6 || numbers.has(number) || !body || !name ||
      !/^[1-5]$/.test(stars) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !["Yes", "No"].includes(anonymous) || !["Yes", "No"].includes(incentive))
      throw new Error("Invalid manual review metadata.");
    // Date-only source: midnight UTC is a serialization convention, not a known submission time.
    const timestamp = `${date}T00:00:00.000Z`;
    if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp)
      throw new Error("Invalid manual review date.");
    numbers.add(number);
    result.push({ id: `smelt-manual-review-${number}`, productId: REVIEW_PRODUCT_ID,
      source: "manual", status: "published", publishedAt: timestamp, submittedAt: timestamp,
      rating: Number(stars), body, displayName: name, anonymous: anonymous === "Yes",
      // Merchant confirms these were received personally on WhatsApp from verified buyers.
      incentivized: incentive === "Yes", verifiedPurchase: true, colours: [] });
  }
  if (!result.length || result.length !== texts.size) throw new Error("Manual reviews need matching metadata and text.");
  return result;
}
