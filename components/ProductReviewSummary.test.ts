import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewSummary } from "@/lib/reviews";
import ProductReviewSummary from "./ProductReviewSummary";

const summary: ReviewSummary = {
  total: 16,
  average: 5,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 16 },
};

describe("product title review summary", () => {
  it("links the current rating and verified review count to the reviews section", () => {
    const html = renderToStaticMarkup(createElement(ProductReviewSummary, { summary }));
    expect(html).toContain('href="#reviews"');
    expect(html).toContain("5.0/5");
    expect(html).toContain("from 16 verified reviews");
  });

  it("uses the supplied average and singular review label", () => {
    const html = renderToStaticMarkup(createElement(ProductReviewSummary, {
      summary: { ...summary, total: 1, average: 4.2 },
    }));
    expect(html).toContain("4.2/5");
    expect(html).toContain("from 1 verified review</span>");
  });

  it("does not invent a rating while loading or when there are no reviews", () => {
    expect(renderToStaticMarkup(createElement(ProductReviewSummary, { summary: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(ProductReviewSummary, {
      summary: { ...summary, total: 0, average: 0 },
    }))).toBe("");
  });
});
