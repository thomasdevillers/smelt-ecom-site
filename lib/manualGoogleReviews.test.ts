import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { manualGoogleReviews } from "./manualGoogleReviews";
import { googleReviewFeed } from "./googleReviewFeed";

const markdown = readFileSync(new URL("../reviews.md", import.meta.url), "utf8");

describe("WhatsApp review import", () => {
  it("includes all 25 reviews with the supplied metadata and merchant verification", () => {
    const reviews = manualGoogleReviews(markdown);
    expect(reviews).toHaveLength(25);
    expect(reviews.every(review => review.verifiedPurchase && !review.incentivized)).toBe(true);
    expect(reviews[0]).toMatchObject({ displayName: "Jason M.", rating: 5, submittedAt: "2026-08-06T00:00:00.000Z" });
    expect(reviews[4].rating).toBe(4);
    const feed = googleReviewFeed(reviews);
    expect(feed.count).toBe(25);
    expect(feed.xml).toContain("Johan &amp; Anika");
    expect(feed.xml).toContain("<is_verified_purchase>true</is_verified_purchase>");
  });

  it("rejects missing metadata, impossible dates, and duplicate numbers", () => {
    expect(() => manualGoogleReviews(markdown.replace("| 1 | 5 |", "| 1 | ? |"))).toThrow();
    expect(() => manualGoogleReviews(markdown.replace("2026-08-06", "2026-02-30"))).toThrow();
    expect(() => manualGoogleReviews(`${markdown}\n1. “duplicate”`)).toThrow();
  });
});
