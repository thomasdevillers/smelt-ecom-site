# Review request and R50 voucher automation

## Customer flow

1. An order is marked complete in `/admin`.
2. Ten days later, the daily cron may email the customer a private, single-use review link.
3. Any submitted verified review receives a personal R50 voucher, regardless of its rating.
4. The voucher is shown immediately after submission and emailed in the standard Smelt email design.
5. It is valid for 90 days, tied to the review email, and can be used once at checkout.

Published incentivized reviews are labelled `Verified purchase · R50 thank-you`.

## Safety and deduplication

- Review requests are disabled unless `REVIEW_REQUESTS_ENABLED=true`.
- The request job sends at most 10 eligible emails per daily run, oldest first.
- Orders with an existing review or an existing manually-created review link are skipped.
- Resend idempotency and Redis receipts prevent repeat emails.
- Voucher validation, email matching, the R50 discount, and single-use redemption are enforced server-side.
- A voucher is reserved when Paystack checkout is initialized and redeemed only after authenticated payment success. Ambiguous payment sessions retain the hold so the same voucher cannot discount two payments; support can review a stranded hold.
- Test and live data are separated by the Paystack key mode.

## Production configuration

The existing values are reused:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`
- `ORDER_FROM_EMAIL`
- `SITE_URL`
- `PAYSTACK_SECRET_KEY`
- `CRON_SECRET`

Add `REVIEW_REQUESTS_ENABLED=true` only when the request email has been approved and historical completed orders should begin receiving it.

Vercel schedules:

- `/api/cron/review-requests` daily at 08:00 UTC (10:00 South African time)
- `/api/cron/review-rewards` hourly at minute 17 for reward-email retries

## Manual test

1. Use Paystack test mode and a completed test order with your own email.
2. Generate/open its private review link from the admin dashboard.
3. Submit any rating and confirm the success screen shows an R50 code.
4. Confirm the reward email contains the same code.
5. Add a hat to a new checkout, enter the same email, apply the code, and confirm the total drops by R50.
6. Complete a Paystack test payment, then confirm the code cannot be applied again.

Do not use a real customer email while testing. Local automated tests do not send Resend email or create Paystack payments.
