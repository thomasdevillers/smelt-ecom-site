# Google Merchant Center product reviews

Run `npm run reviews:google` with `.env.local` pointing at the live review store.
The upload file is `.local/google-merchant/product-reviews.xml` (excluded from Git).
This is a read-only export of all published live reviews, not just positive reviews.
It also merges the 25 reviews and metadata in `content/manual-reviews.json`. Keep their
numbering stable: numbers form permanent review IDs. Duplicate text stops the
export. Manual reviews are marked as verified purchases based on the merchant's
confirmation that they came personally via WhatsApp from verified buyers, and use the general
product URL rather than guessing purchased colours. Date-only submissions are
serialized at midnight UTC; exact submission times are not known.

**Before submitting:** the manual reviews must also be published on the review
landing page (`/product#reviews`). Exporting them does not publish them to the
storefront or import them into the database. Check for duplicates against stored
reviews and confirm the original dates before uploading.
Anonymous names stay anonymous, refund incentives are disclosed, and no emails,
order references, private photo storage paths, or invitation tokens are exported.
Submission dates and review IDs remain stable. Reviews covering both colours
appear once with both products. Invalid published records stop the whole export.

The SKUs match the site's structured data (`smelt-sauna-hat-green` and
`smelt-sauna-hat-cream`). Confirm these and the product URLs match Merchant
Center's product catalogue before uploading. No GTIN or MPN is invented; if
assigned identifiers exist in Merchant Center, add those to the exporter for
better matching.

1. Have at least 50 genuine product reviews and sign up for Product Ratings
   using Google's interest form.
2. Validate the generated XML against Google's Product Review Feeds 2.4 schema:
   `https://www.google.com/shopping/reviews/schema/product/2.4/product_reviews.xsd`.
3. In Merchant Center: **Products and shop → Reviews → Product reviews →
   Manage product review sources → Add product reviews → Add product reviews
   from a file → Upload a file from your computer**.
4. Select the XML file, continue, and check processing diagnostics. Initial
   processing can take 2–4 weeks; inclusion is not guaranteed.
5. Regenerate and upload the **full file at least monthly**. Reviews missing
   from a replacement feed are deleted from Google. This command does not
   upload automatically or change your website.

References: https://support.google.com/merchants/answer/14620160?hl=en-GB
and https://developers.google.com/product-review-feeds/schema
