import { COLOURS, PRODUCT, type Colour } from "./product";
import { BASE_PRICE, SHIPPING_FEE } from "./pricing";
import { PREORDER_MODE } from "./salesMode";
import { metaContentId } from "./meta";
import type { Availability } from "./preorders";
import { reviewSummary, type PublishedReviews } from "./reviews";
import { abs } from "./seo";

/** Unknown inventory must not be advertised as either available or sold out. */
export function variantAvailability(stock: Availability | null, colour: Colour, preorderMode = PREORDER_MODE) {
  if (!stock) return undefined;
  if (!preorderMode && stock[colour] > 0) return "https://schema.org/InStock";
  if (stock.preorder[colour] > 0) return "https://schema.org/PreOrder";
  return "https://schema.org/OutOfStock";
}

function productRatings(data: PublishedReviews | null) {
  if (!data?.reviews.length) return {};
  const reviews = data.reviews;
  // Only emit the complete visible rating, never a hand-picked subset.
  if (reviews.some(review => !review.verifiedPurchase || review.id.startsWith("dev-") ||
    !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 ||
    !review.body.trim() || !review.displayName.trim() || review.displayName.length >= 100 ||
    !Number.isFinite(Date.parse(review.publishedAt)))) return {};
  const summary = reviewSummary(reviews);
  if (summary.total !== data.summary.total || summary.average !== data.summary.average) return {};
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: summary.average,
      reviewCount: summary.total,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.map(review => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.displayName },
      datePublished: review.publishedAt,
      reviewBody: review.body,
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    })),
  };
}

/** Single-page ProductGroup: reviews describe the hat, not a specific colour. */
export function productGroupLd(stock: Availability | null, reviews: PublishedReviews | null) {
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": abs("/product#product-group"),
    productGroupID: "smelt-sauna-hat",
    name: PRODUCT.name,
    description: "100% wool felt sauna hat, embroidered front and back. One size fits most heads.",
    url: abs("/product"),
    brand: { "@type": "Brand", name: "Smelt" },
    material: "100% wool felt",
    variesBy: ["https://schema.org/color"],
    ...productRatings(reviews),
    hasVariant: COLOURS.map(colour => {
      const variant = PRODUCT.variants[colour];
      const url = abs(`/product?colour=${colour}`);
      const availability = variantAvailability(stock, colour);
      return {
        "@type": "Product",
        "@id": abs(`/product#${colour}`),
        sku: metaContentId(colour),
        name: `${PRODUCT.name} · ${variant.name}`,
        description: `100% wool felt sauna hat in ${variant.name}, embroidered front and back. One size fits most heads.`,
        url,
        color: variant.name,
        size: "One size",
        image: [abs(variant.images.front), abs(variant.images.back)],
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "ZAR",
          price: BASE_PRICE,
          ...(availability ? { availability } : {}),
          itemCondition: "https://schema.org/NewCondition",
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "ZA",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 7,
            returnMethod: "https://schema.org/ReturnByMail",
            returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
          },
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: { "@type": "MonetaryAmount", value: SHIPPING_FEE, currency: "ZAR" },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "ZA" },
          },
        },
      };
    }),
  };
}
