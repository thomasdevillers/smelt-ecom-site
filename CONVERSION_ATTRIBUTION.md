# Meta or Organic

The owner order email shows **Source: Meta** or **Source: Not Meta**. Admin and Store performance label the same groups **Meta** and **Organic**. Older orders without tracking show **Not recorded**.

- **Meta:** a visit through a Meta ad link tagged with `utm_source=meta` in the 30 days before checkout. Previously tagged Facebook/Instagram paid links also work.
- **Organic:** everything else, including search, direct visits, social posts, email and referrals. This is the store's simple non-Meta category, rather than the analytics definition of organic search.

A recorded Meta visit is kept through subsequent direct, search or email visits. Its timestamp is not extended by those visits, so Meta attribution still expires 30 days after the ad visit. Another tagged Meta visit starts a fresh 30-day window.

## What you need to do

Deploy this update through the usual release process. No new environment variables or Paystack settings are needed.

For every Facebook/Instagram ad, put this in the ad's **URL parameters** field:

```text
utm_source=meta
```

Use the same value for every ad. No medium, campaign name or ad name is required.

If editing the destination link instead, use:

```text
https://saunahat.co.za/product?utm_source=meta
```

If the link already has a query, append `&utm_source=meta`, preserving the existing selection parameters. For example:

```text
https://saunahat.co.za/product?colour=green&utm_source=meta
```

Your bio links, organic posts, newsletters and WhatsApp messages can stay as they are. Reserve the Meta tag for ad links. A Facebook referral or `fbclid` alone cannot establish that someone clicked an ad, so untagged ads may count as Organic.

## Quick verification

1. Open the tagged product link in a fresh browser profile and complete a payment in a Paystack test-mode environment. The owner email and admin order should show **Source: Meta**.
2. In a separate fresh browser profile, visit without the tag. The owner email should show **Source: Not Meta**, and the admin order should show **Source: Organic**.
3. Return without the tag in the Meta browser profile within 30 days. It should still show **Meta**.
4. Check **Store performance → Meta or Organic** against the paid orders in that date range. Historical orders without tracking should show **Not recorded**.

Tracking is saved in private Paystack order metadata before payment, so the signed webhook can use it even if the customer closes the tab. Customer receipts and public payment-verification responses do not include attribution. Browser storage is optional; blocked storage falls back to memory within the current document and never blocks checkout. Tracking does not join devices or recover previously missing historical sources.

Internally, existing bounded attribution fields remain readable for compatibility. Private recovery/voucher/review tokens, full referrer URLs and raw click IDs are excluded from saved attribution. No emails are sent by installing or testing this change. Local tests use mocked providers; passing tests/build do not verify deployment, live payments or email delivery.
