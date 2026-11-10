import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewSummary, type PublicReview } from "@/lib/reviews";
import ProductReviews from "./ProductReviews";
import ProductReviewSummary from "./ProductReviewSummary";

const review: PublicReview = {
  id: "published", displayName: "Sauna regular", rating: 4,
  body: "Comfortable wool felt and a roomy fit.", colours: ["green"],
  photos: [{ url: "/review-photo.webp", pathname: "public/photo.webp" }],
  verifiedPurchase: true, publishedAt: "2026-11-01",
};

afterEach(() => vi.unstubAllGlobals());

describe("server-rendered product reviews", () => {
  it("renders review content, photos and the rating without a browser fetch", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const summary = reviewSummary([review]);
    const html = renderToStaticMarkup(createElement(ProductReviews, {
      data: { reviews: [review], summary, sort: "helpful" },
    }));
    expect(html).toContain(review.body);
    expect(html).toContain(review.displayName);
    expect(html).toContain("/review-photo.webp");
    expect(html).toContain("4.0");
    expect(html).toContain("Most helpful");
    expect(html).not.toContain("Loading reviews");
    expect(fetch).not.toHaveBeenCalled();
    const summaryHtml = renderToStaticMarkup(createElement(ProductReviewSummary, { summary }));
    expect(summaryHtml).toContain("4.0/5");
    expect(summaryHtml).toContain('href="#reviews"');
  });

  it("distinguishes an empty review list from a failed read", () => {
    const emptyHtml = renderToStaticMarkup(createElement(ProductReviews, {
      data: { reviews: [], summary: reviewSummary([]) },
    }));
    expect(emptyHtml).toContain("No reviews yet");
    expect(emptyHtml).not.toContain("temporarily unavailable");
    const failureHtml = renderToStaticMarkup(createElement(ProductReviews, { data: null }));
    expect(failureHtml).toContain("Reviews are temporarily unavailable");
    expect(failureHtml).not.toContain("No reviews yet");
  });
});
