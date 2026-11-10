import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewSummary, type PublicReview } from "@/lib/reviews";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/publishedReviews", () => ({ getPublishedReviews: vi.fn() }));
vi.mock("@/lib/productAvailability", () => ({ getProductAvailability: vi.fn() }));
vi.mock("@/components/ProductClient", () => ({ default: vi.fn(() => createElement("main")) }));

import { connection } from "next/server";
import { getPublishedReviews } from "@/lib/publishedReviews";
import { getProductAvailability } from "@/lib/productAvailability";
import ProductClient from "@/components/ProductClient";
import ProductPage from "./page";

const customer: PublicReview = {
  id: "customer-review", displayName: "Alex", body: "Comfortable wool felt.", rating: 4,
  colours: ["cream"], photos: [], verifiedPurchase: true, incentivized: true, publishedAt: "2026-11-01",
};
const data = { reviews: [customer], summary: reviewSummary([customer]) };
const stock = { green: 0, cream: 0, preorder: { green: 4, cream: 0 }, batch: "2026-11-30", timing: "Pre-order", localTest: false };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  vi.mocked(getPublishedReviews).mockResolvedValue(data);
  vi.mocked(getProductAvailability).mockResolvedValue(stock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function render(searchParams = {}) {
  const html = renderToStaticMarkup(await ProductPage({ searchParams: Promise.resolve(searchParams) }));
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
  return JSON.parse(scripts[0][1]);
}

describe("product page search markup", () => {
  it("includes live ratings in the HTML and seeds the client with the same data and stock", async () => {
    const schema = await render({ colour: "cream", order: "3" });
    expect(connection).toHaveBeenCalledOnce();
    expect(schema.aggregateRating.ratingValue).toBe(4);
    expect(schema.aggregateRating.reviewCount).toBe(1);
    expect(schema.hasVariant[0].offers.availability).toBe("https://schema.org/PreOrder");
    expect(schema.hasVariant[1].offers.availability).toBe("https://schema.org/OutOfStock");
    expect(vi.mocked(ProductClient).mock.calls[0][0]).toMatchObject({
      reviewData: data, initialStock: stock, initialColour: "cream", initialQuantity: 3,
    });
  });

  it.each(["development", "test"])("excludes non-production ratings in %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    expect(await render()).not.toHaveProperty("aggregateRating");
  });

  it("excludes payment-test reviews even in a production build", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
    expect(await render()).not.toHaveProperty("aggregateRating");
  });

  it("still renders products when inventory and review reads fail", async () => {
    vi.mocked(getProductAvailability).mockResolvedValue(null);
    vi.mocked(getPublishedReviews).mockResolvedValue(null);
    const schema = await render();
    expect(schema.hasVariant).toHaveLength(2);
    expect(schema.hasVariant[0].offers).not.toHaveProperty("availability");
    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("uses the first query value consistently with the browser's URLSearchParams", async () => {
    await render({ colour: ["cream", "green"], order: ["bundle", "4"] });
    expect(vi.mocked(ProductClient).mock.calls[0][0]).toMatchObject({ initialColour: "cream", initialQuantity: 2 });
  });
});
