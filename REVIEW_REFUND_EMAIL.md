# Review refund email

The authorised customer campaign was sent on 8 October 2026. Live completed orders contained 57 distinct customers; two customers who had already submitted a review were excluded. All 55 eligible customers received their personalised email, and Resend reported `last_event: delivered` for every exact message ID. Each personal invitation was checked against its customer and completed order, and the live form reported photo uploads available before sending. No refunds were calculated or processed.

Private recipient audit, frozen email copies, personal links, message IDs and delivery receipts are saved in `.local/review-refund/customer-campaign-2026-10-08/`. These files are ignored by Git and Vercel. Accepted receipts are also stored in the live review-outreach namespace to prevent the scheduled request sender from sending another request for these orders.

Deployed to production on 8 October 2026: `dpl_J2HnK2yuVx1rqbnokfhSHwJkGNps`. The live domain was checked against that deployment. Live browser checks covered the refund wording, one-star rating, required photos, photo selection/removal and submit-button gating. A temporary invalid-order invitation verified that the deployed API rejects photo-free submissions; it was then removed. No real customer review, voucher, refund or email was created during verification. Actual customer photo upload and successful paid-order submission were not exercised on production.

## Subject and preview text

**Subject:** Review your Smelt. Get R50 back per hat.

**Preview text:** One honest order review, photos of your hats, and R50 back for every hat you bought.

## Email copy

**A little feedback. A little back.**

Hi {{first_name}},

Your Smelt has had some time in the heat. How’s it holding up?

We’d love your honest take on your order. Fit, feel, sauna sessions — whatever stood out.

**R50 back. For every hat.**

Leave one review of your order and **add photos of your hats**. We’ll refund R50 for every hat you bought in that order. Every rating counts.

Your personal link is below. Choose a rating, write a few words and upload your hat photos. One review covers your whole order.

**[Leave my review]({{personal_review_url}})**

Once your review and hat photos are in, we’ll work out your refund and return it to your original payment method within a couple of days.

Warm regards,

Tom & Marc

100% wool felt. Shipped from Cape Town.

## Preview

Run `npx tsx scripts/preview-review-refund.ts` from the repository root. It creates HTML, plain text and subject files under `.local/review-refund/previews/` using a labelled sample name and an inactive example link. This script cannot send emails and does not access customer data or create invitations.

The template in `lib/emails/reviewRefundRequest.ts` accepts the customer's name and exact personal review URL. It reuses the existing Smelt email layout, colours, product image, dark-mode rules and signoff. No refund calculation is included.

## Before preparing or sending the customer batch

- Select successfully paid orders marked completed. Exclude customers who have already submitted a review, including pending or rejected reviews; do not limit the exclusion to published reviews. Recheck eligibility before sending. Decide how to group multiple eligible orders for the same customer.
- Put each recipient's own order-linked invitation URL in their button and plain-text message. The current invitation creator replaces older links, and existing links expire after 90 days. The offer has no deadline; the review-link lifecycle must support renewal without changing that offer. Do not create or replace live invitations just to preview the draft.
- Keep refunds and amounts manual. Every rating qualifies once the review includes hat photos; publication or a positive rating is not a refund condition. Keep the existing incentivized-review disclosure.
- Prepare and inspect the personalised batch before any separately authorised send. This draft does not create a recipient list or process refunds.

## Review flow update

- The review entry page, private form, product-page request and WhatsApp invitation use the same R50-per-hat refund offer. The existing scheduled request template uses the branded email above. The customer batch described above was sent separately; the scheduler was not manually triggered.
- The form and server require at least one hat photo, with the existing maximum of three. If photo uploads are unavailable, the form asks the customer to try again later and prevents submission. Review validation, purchase verification, one-use invitations, moderation and photo privacy remain in place.
- Successful submission saves the review with `rewardType: manual_refund`. It no longer creates a review voucher, queues a voucher reward or emails a new voucher. The on-screen confirmation explains the manual refund timing and original payment method. No refund is automatically calculated or processed.
- Admin review cards identify new manual-refund reviews alongside their existing checkout email and order reference. Check the order quantity and process the refund manually, regardless of rating or publication. Keep a manual payment record to avoid duplicate refunds.
- Already-issued vouchers remain redeemable. The legacy reward queue can still deliver vouchers already created under the earlier offer; unrelated cart-recovery discounts remain available.
- Frozen pending review-request emails from the old voucher offer are held for manual reconciliation instead of retried with outdated copy. Existing invitation expiries and already-delivered invitations are unchanged.
