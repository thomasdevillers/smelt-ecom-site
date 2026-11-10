import { describe, expect, it } from "vitest";
import { productGroupLd, variantAvailability } from "./productSchema";
import { BASE_PRICE, SHIPPING_FEE } from "./pricing";
import { reviewSummary, type PublicReview } from "./reviews";
import type { Availability } from "./preorders";

const stock: Availability = {
  green: 3, cream: 0, preorder: { green: 5, cream: 0 },
  batch: "2026-11-30", timing: "Pre-orders ship on 30 November.", localTest: false,
};
const customer: PublicReview = {
  id: "customer-review", displayName: "Alex", body: "Roomy fit and comfortable wool felt.", rating: 5,
  colours: ["green"], photos: [], verifiedPurchase: true, incentivized: false, publishedAt: "2026-11-01T12:00:00.000Z",
};
const reviewData = (reviews: PublicReview[]) => ({ reviews, summary: reviewSummary(reviews) });

describe("variant availability", () => {
  it("uses actual per-colour stock outside pre-order mode", () => {
    expect(variantAvailability(stock, "green", false)).toBe("https://schema.org/InStock");
    expect(variantAvailability(stock, "cream", false)).toBe("https://schema.org/OutOfStock");
  });
  it("only advertises a pre-order when capacity remains", () => {
    expect(variantAvailability(stock, "green", true)).toBe("https://schema.org/PreOrder");
    expect(variantAvailability(stock, "cream", true)).toBe("https://schema.org/OutOfStock");
    expect(variantAvailability({ ...stock, preorder: { green: 0, cream: 0 } }, "green", true)).toBe("https://schema.org/OutOfStock");
  });
  it("supports a future allocation when the shelf is empty", () => {
    expect(variantAvailability({ ...stock, green: 0 }, "green", false)).toBe("https://schema.org/PreOrder");
  });
  it("does not invent availability after a failed stock read", () => {
    expect(variantAvailability(null, "green", true)).toBeUndefined();
    expect(variantAvailability(null, "cream", false)).toBeUndefined();
    expect(productGroupLd(null, null).hasVariant[0].offers).not.toHaveProperty("availability");
  });
});

describe("product group structured data", () => {
  it("describes both colours with distinct identifiers, images and selectable URLs", () => {
    const group = productGroupLd(stock, null);
    expect(group["@type"]).toBe("ProductGroup");
    expect(group.productGroupID).toBe("smelt-sauna-hat");
    expect(group.variesBy).toEqual(["https://schema.org/color"]);
    expect(group.hasVariant.map(variant => variant.color)).toEqual(["Forest Green", "Natural Cream"]);
    expect(new Set(group.hasVariant.map(variant => variant.sku)).size).toBe(2);
    expect(new Set(group.hasVariant.map(variant => variant["@id"])).size).toBe(2);
    for (const [index, colour] of ["green", "cream"].entries()) {
      const variant = group.hasVariant[index];
      expect(variant["@type"]).toBe("Product");
      expect(variant.sku).toBe(`smelt-sauna-hat-${colour}`);
      expect(variant.url).toMatch(new RegExp(`/product\\?colour=${colour}$`));
      expect(variant.offers.url).toBe(variant.url);
      expect(variant.image).toHaveLength(2);
      expect(variant.image.every(image => image.startsWith("https://") && image.includes(`hat-${colour}-`))).toBe(true);
      expect(variant.offers.price).toBe(BASE_PRICE);
      expect(variant.offers.priceCurrency).toBe("ZAR");
      expect(variant.offers.shippingDetails.shippingRate.value).toBe(SHIPPING_FEE);
      expect(variant.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
      expect(variant.offers).not.toHaveProperty("priceValidUntil");
    }
  });

  it("matches the complete visible rating, including disclosed incentives and low-star reviews", () => {
    const reviews = [customer, { ...customer, id: "incentivized", rating: 1, incentivized: true }];
    const group = productGroupLd(stock, reviewData(reviews));
    expect(group.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 3, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(group.review?.map(review => review.reviewRating.ratingValue)).toEqual([5, 1]);
    expect(group.review?.[0].reviewBody).toBe(customer.body);
    expect(group.hasVariant[0]).not.toHaveProperty("aggregateRating");
  });

  it("omits ratings when no reviews are available", () => {
    expect(productGroupLd(stock, null)).not.toHaveProperty("aggregateRating");
    expect(productGroupLd(stock, reviewData([]))).not.toHaveProperty("review");
  });

  it("does not mark up a subset that disagrees with the visible total or average", () => {
    const data = reviewData([customer]);
    expect(productGroupLd(stock, { ...data, summary: { ...data.summary, total: 9 } })).not.toHaveProperty("aggregateRating");
    expect(productGroupLd(stock, { ...data, summary: { ...data.summary, average: 4 } })).not.toHaveProperty("aggregateRating");
  });

  it.each([
    { id: "dev-review-example" }, { rating: 0 }, { rating: 6 }, { rating: 4.5 },
    { publishedAt: "" }, { body: " " }, { displayName: " " }, { displayName: "a".repeat(100) },
  ])("omits all ratings rather than inventing eligibility for %j", overrides => {
    const data = reviewData([{ ...customer, ...overrides }]);
    expect(productGroupLd(stock, data)).not.toHaveProperty("aggregateRating");
  });
});
