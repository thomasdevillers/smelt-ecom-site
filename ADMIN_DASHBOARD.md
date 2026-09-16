# Smelt dispatch desk

Open `/admin` on the deployed Smelt site. The dashboard lists successful Paystack payments, newest first, with 25 orders per page. Use **Active orders** and **Completed orders** to switch sections. Search by full customer email or payment reference within either section. Unpaid checkout attempts are not orders in this view.

## Daily workflow

1. Sign in with the shared admin password.
2. Check the customer, items and delivery details.
3. Paste the Aramex waybill next to the order and click **Send email**.
4. The existing `shippingEmail()` template sends the tracking link and care guide. The recipient comes from Paystack, never from the browser.
5. After acceptance, **Mark complete** replaces the waybill form. It moves the order to **Completed orders**, retains its tracking link and records the completion date. **Reopen order** moves it back without resending an email.
6. **Email accepted** means Resend accepted the request. Click **Check status** to retrieve delivery, bounce or delay status. Email delivery does not mean parcel delivery.

Each order can receive one shipping notification through this dashboard. Accepted sends are locked. Recent uncertain sends can retry the same frozen email and provider idempotency key; attempts older than 23 hours require manual reconciliation. Changed waybills require operator review, not an automatic second email. Founder-delivery orders are visible but cannot send an Aramex notification.

## Configuration

Set these **server-side** environment variables in Vercel Production:

- `ADMIN_PASSWORD`: at least 16 characters; use a unique generated password.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: the existing Smelt Redis database.
- `PAYSTACK_SECRET_KEY`: the **live** key for real orders. Test keys display test payments.
- `RESEND_API_KEY` and `ORDER_FROM_EMAIL`: the existing verified sender.
- `SITE_URL`: `https://saunahat.co.za`.

Run `npm run admin:setup` to generate a password in `.env.local` and save it privately to `.local/admin/login.txt`. It preserves a nonempty existing password. Add the same password to Vercel and redeploy. Never commit `.env.local` or `.local/`.

Login sessions are opaque random tokens held in HttpOnly, SameSite=Strict cookies, Secure in production, with a 12-hour lifetime. Sessions live in Redis and are deleted on logout. Changing the password invalidates existing sessions. Login rate limiting uses shared storage. Reads and mutations require authentication, mutations require the same origin, and responses use `Cache-Control: private, no-store`. No customer data is embedded in the public admin page. The admin area excludes storefront chrome and marketing script mounting and is marked noindex.

## Preserve manual shipping history

Before using the deployed dashboard:

```sh
npm run admin:import-shipping
npm run admin:import-shipping -- --apply
```

This imports local accepted **and pending** receipts into Redis without sending emails or overwriting shared records. Previous receipts do not contain payment references, so they appear as customer history, not as an assumed shipment for a particular order. Check that history before sending. Reusing an already accepted email/waybill pair attaches its existing receipt to the order without sending again.

The manual CLI now also checks shared receipts when Redis is configured. Always keep Redis configured when using the CLI alongside the dashboard. Running it without Redis retains its original local-only behavior and cannot see dashboard sends.

## Storage and recovery

- `smelt:orders:completed:v1:live` / `test`: persistent completion timestamps by payment reference, separated by payment mode.
- `smelt:admin:session:v1:*`: expiring login sessions.
- `smelt:admin:login:*`: 15-minute login rate limits.
- `smelt:shipping:order:v1:*`: one notification per payment reference.
- `smelt:shipping:receipt:v1:*`: one notification per email/waybill pair, shared with the CLI.
- `smelt:shipping:history:v1:*`: previous notifications per customer.

Payment records remain in Paystack. Shipping receipts have no TTL: keep this database and its backups. A pending receipt is written atomically before contacting Resend. Accepted receipts remove the frozen email content and retain the message ID and shipment details. If provider acceptance occurs but Redis persistence fails, a retry inside 23 hours uses the identical Resend idempotency key and message; after that window, check Resend manually before changing any receipt.

## Validation

```sh
npm test
npm run lint
npm run build
```

Manual checks after deployment: sign in from desktop and phone; open older pages; search an exact email; inspect an order; enter a waybill; send only for an intended shipment; refresh and confirm the same receipt remains; check its delivery status; sign out and confirm `/api/admin/orders` returns 401. Tests mock outbound email; they do not email customers.

API references: [Paystack transactions](https://paystack.com/docs/api/transaction/) and [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
