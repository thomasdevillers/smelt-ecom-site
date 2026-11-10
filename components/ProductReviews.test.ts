import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewSummary, type PublicReview } from "@/lib/reviews";
import ProductReviews from "./ProductReviews";

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: vi.fn(),
}));

const helpful: PublicReview = {
  id: "helpful", displayName: "Helpful reviewer", rating: 4, body: "Specific fit and care advice.",
  colours: ["green"], photos: [], verifiedPurchase: true, publishedAt: "2026-10-01",
};
const recent: PublicReview = { ...helpful, id: "recent", displayName: "Recent reviewer", publishedAt: "2026-11-01" };
const reviews = [helpful, recent];

function render(sort: "helpful" | "newest", serverSort: "helpful" | "newest" = "helpful") {
  vi.mocked(useState)
    .mockReturnValueOnce([null, vi.fn()])
    .mockReturnValueOnce([sort, vi.fn()]);
  return renderToStaticMarkup(createElement(ProductReviews, {
    data: { reviews, summary: reviewSummary(reviews), sort: serverSort },
  }));
}

afterEach(() => vi.resetAllMocks());

describe("review sorting toggle", () => {
  it("defaults to most helpful and preserves the server's score order", () => {
    const html = render("helpful");
    expect(vi.mocked(useState).mock.calls[1]).toEqual(["helpful"]);
    expect(html).toContain('aria-pressed="true">Most helpful</button>');
    expect(html).toContain('aria-pressed="false">Most recent</button>');
    expect(html.indexOf("Helpful reviewer")).toBeLessThan(html.indexOf("Recent reviewer"));
  });

  it("orders by publication date for most recent without mutating the helpful order", () => {
    const html = render("newest");
    expect(html).toContain('aria-pressed="true">Most recent</button>');
    expect(html.indexOf("Recent reviewer")).toBeLessThan(html.indexOf("Helpful reviewer"));
    expect(reviews[0]).toBe(helpful);
  });

  it("keeps both choices visible when helpfulness scores are unavailable", () => {
    const html = render("helpful", "newest");
    expect(html).toContain("Most helpful</button>");
    expect(html).toContain("Most recent</button>");
  });
});
