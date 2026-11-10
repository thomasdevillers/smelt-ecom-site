# Product search markup

`app/product/page.tsx` renders one `ProductGroup` with Forest Green and Natural
Cream `Product` variants. The variant SKUs reuse the existing catalogue IDs. Each
variant has its own selectable `?colour=` URL, front/back images and single-hat
offer. `/product` remains the canonical URL for the whole group.

## Availability

The product page renders at request time and calls the same `getAvailability()`
function as `/api/inventory`. It passes the snapshot to both the schema builder
and the initial product UI. Browser refreshes and checkout validations remain in
place. Inventory is not frozen into a build or cached with reviews.

- Stock mode: physical stock is `InStock`.
- Available future allocation is `PreOrder` (in pre-order mode, shelf stock is
  deliberately not offered, matching the storefront).
- No purchasable allocation is `OutOfStock`.
- A failed inventory read omits availability rather than guessing.

There is no fabricated `priceValidUntil`: add that optional property only when
there is a real price-expiry policy.

## Ratings and incentives

Ratings are attached to the group, because the visible rating combines both
colours. They use the same complete published-review dataset as the visible
summary, including low-star reviews. Empty, unavailable, inconsistent or malformed
datasets omit rating markup. Development fixtures and non-live environments do
not produce search rating markup.

Google Search's review-snippet guidelines prohibit fake or **undisclosed**
incentivised reviews. Incentivised reviews therefore carry a visible disclosure
on their card, stating that a refund was offered regardless of the star rating.
This must remain visible if the card is redesigned. Moderation must not suppress
genuine negative reviews or condition rewards on positive sentiment.

This is Search structured data, not a Merchant Center review feed. Any future
Product Ratings feed has separate eligibility/submission requirements, including
the `is_incentivized_review` attribute for incentivised reviews.

Sources checked 10 November 2026:

- https://developers.google.com/search/docs/appearance/structured-data/product-variants
- https://developers.google.com/search/docs/appearance/structured-data/review-snippet#technical-guidelines
- https://support.google.com/merchants/answer/6098512?hl=en

After deployment, test `/product` in Google's Rich Results Test and inspect the
URL in Search Console. Valid markup does not guarantee enhanced results.
