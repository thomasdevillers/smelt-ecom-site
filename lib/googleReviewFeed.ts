import { metaContentId } from "./meta";
import { PRODUCT } from "./product";
import { REVIEW_PRODUCT_ID, type ReviewRecord } from "./reviews";
import { abs } from "./seo";

export type GoogleFeedReview = Pick<ReviewRecord, "id" | "productId" | "status" | "publishedAt" | "submittedAt" | "rating" | "body" | "anonymous" | "displayName" | "colours" | "incentivized" | "rewardType"> & {
  verifiedPurchase: boolean;
  source?: "manual";
};

function xml(value: string): string {
  // Reject characters XML 1.0 cannot represent instead of altering review text.
  if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value))
    throw new Error("Feed contains invalid XML characters.");
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

/** Full published feed, independent of star rating or helpfulness ranking. */
export function googleReviewFeed(records: GoogleFeedReview[]): { xml: string; count: number } {
  const reviews = records.filter(review => review.status === "published");
  if (!reviews.length) throw new Error("No published reviews to export.");
  const ids = new Set<string>();
  const bodies = new Set<string>();
  const entries = reviews.map(review => {
    if (!review.id || review.id.startsWith("dev-") || ids.has(review.id) ||
      review.productId !== REVIEW_PRODUCT_ID || !review.publishedAt ||
      !Number.isFinite(Date.parse(review.submittedAt)) ||
      !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 ||
      !review.body.trim() || (!review.anonymous && !review.displayName.trim()) ||
      (!review.colours.length && review.source !== "manual") || review.colours.some(colour => colour !== "green" && colour !== "cream") ||
      bodies.has(review.body.trim().toLowerCase()))
      throw new Error("Published review is invalid; export stopped to avoid a partial feed.");
    ids.add(review.id);
    bodies.add(review.body.trim().toLowerCase());
    const products = [...new Set(review.colours)].map(colour => `        <product>
          <product_ids><skus><sku>${xml(metaContentId(colour))}</sku></skus><brands><brand>Smelt</brand></brands></product_ids>
          <product_name>${xml(`${PRODUCT.name} · ${PRODUCT.variants[colour].name}`)}</product_name>
          <product_url>${xml(abs(`/product?colour=${colour}`))}</product_url>
        </product>`).join("\n") || `        <product>
          <product_ids><brands><brand>Smelt</brand></brands></product_ids>
          <product_name>${xml(PRODUCT.name)}</product_name>
          <product_url>${xml(abs("/product"))}</product_url>
        </product>`;
    return `    <review>
      <review_id>${xml(review.id)}</review_id>
      <reviewer><name is_anonymous="${review.anonymous}">${xml(review.anonymous ? "Anonymous" : review.displayName)}</name></reviewer>
      <review_timestamp>${new Date(review.submittedAt).toISOString()}</review_timestamp>
      <content>${xml(review.body)}</content>
      <review_url type="group">${xml(abs("/product#reviews"))}</review_url>
      <ratings><overall min="1" max="5">${review.rating}</overall></ratings>
      <products>
${products}
      </products>
      <is_verified_purchase>${review.verifiedPurchase === true}</is_verified_purchase>
      <is_incentivized_review>${review.incentivized === true || review.rewardType === "manual_refund"}</is_incentivized_review>
    </review>`;
  });
  return { count: reviews.length, xml: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.google.com/shopping/reviews/schema/product/2.4/product_reviews.xsd">
  <version>2.4</version>
  <publisher><name>Smelt</name></publisher>
  <reviews>
${entries.join("\n")}
  </reviews>
</feed>
` };
}
