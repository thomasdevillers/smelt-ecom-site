import { describe, expect, it } from "vitest";
import { googleReviewFeed } from "./googleReviewFeed";
import { REVIEW_PRODUCT_ID, type ReviewRecord } from "./reviews";

const review: ReviewRecord = {
  id: "review-1",
  productId: REVIEW_PRODUCT_ID,
  orderReference: "private-order",
  customerEmail: "private@example.com",
  displayName: "Jane & Jo",
  anonymous: false,
  rating: 1,
  body: 'Warm <hat> & "soft" 🧖',
  colours: ["green", "cream"],
  photos: [],
  verifiedPurchase: true,
  incentivized: true,
  status: "published",
  submittedAt: "2026-10-01T12:00:00Z",
  publishedAt: "2026-10-02T12:00:00Z",
  consentVersion: "2026-09-17",
};

describe("Google product review feed", () => {
  it("exports low ratings, original submission dates, incentives and both purchased variants", () => {
    const feed = googleReviewFeed([review, { ...review, id: "pending", status: "pending" }]);
    expect(feed.count).toBe(1);
    expect(feed.xml).toContain('min="1" max="5">1</overall>');
    expect(feed.xml).toContain("2026-10-01T12:00:00.000Z");
    expect(feed.xml).toContain("<is_incentivized_review>true</is_incentivized_review>");
    expect(feed.xml).toContain("Warm &lt;hat&gt; &amp; &quot;soft&quot; 🧖");
    expect(feed.xml.match(/<product>/g)).toHaveLength(2);
    expect(feed.xml).toContain("smelt-sauna-hat-green");
    expect(feed.xml).not.toContain(review.customerEmail);
    expect(feed.xml).not.toContain(review.orderReference);
  });

  it("honours anonymity and legacy refund disclosures", () => {
    const feed = googleReviewFeed([
      { ...review, anonymous: true, incentivized: undefined, rewardType: "manual_refund" },
    ]);
    expect(feed.xml).toContain('<name is_anonymous="true">Anonymous</name>');
    expect(feed.xml).not.toContain("Jane");
    expect(feed.xml).toContain("<is_incentivized_review>true</is_incentivized_review>");
  });

  it("refuses empty, duplicate, malformed or synthetic feeds instead of silently dropping reviews", () => {
    expect(() => googleReviewFeed([])).toThrow();
    expect(() => googleReviewFeed([review, review])).toThrow();
    for (const changes of [
      { rating: 6 },
      { submittedAt: "invalid" },
      { body: "\u0000" },
      { id: "dev-1" },
      { colours: [] },
    ])
      expect(() => googleReviewFeed([{ ...review, ...changes }])).toThrow();
  });
});
