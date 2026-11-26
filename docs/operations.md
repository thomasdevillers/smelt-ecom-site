# Operations

## Deploy

Vercel deploys this Next.js project. Install from the lockfile and require CI checks before merging. Configure production services from `.env.local.example` plus the [recorded migration status](migration-status.md); example defaults are not a production configuration snapshot.

The admin credential must be at least 16 characters. If an existing deployment uses a shorter one, rotate `ADMIN_PASSWORD` before deploying the strengthened authentication check. Generated credentials from `admin:setup` already meet this requirement. Changing the password invalidates existing sessions.

## Scheduled jobs

`vercel.json` is the scheduling source of truth. All endpoints require `CRON_SECRET`. The retired GitHub abandoned-cart workflow called a nonexistent route and is removed.

| Job | Cadence | Purpose |
| --- | --- | --- |
| `paystack-events` | Every minute | Durable event worker; no-op in legacy mode |
| `paystack-discovery` | Every 10 minutes | Provider discovery; no-op in legacy mode |
| `paystack-reconcile` | Hourly, minute 7 | Payment reconciliation; no-op in legacy mode |
| `inventory` | Every 5 minutes | Reservation maintenance |
| `checkout-followups` | Every 5 minutes | Checkout follow-up processing |
| `cart-emails` | Every 10 minutes | Eligible cart-email sequence |
| `review-requests` | Daily 08:00 UTC | Review invitations |
| `email-audit` | Daily 06:00 UTC | Missing confirmation audit |
| `review-rewards` | Hourly, minute 17 | Review rewards |
| `review-rankings` | Every 10 minutes | Background ranking |
| `review-cleanup` | Daily 03:35 UTC | Review cleanup |

Check the configured Vercel plan supports these frequencies. Feature switches still control whether eligible work runs.

## Common operations

- Shipping: `/admin`, or `npm run email:shipping` with the documented script arguments.
- Admin setup: `npm run admin:setup` writes the generated credential to private local files.
- Google feed: `npm run reviews:google`; see [feed instructions](google-product-reviews.md).
- Database migration: `npm run db:migrate` applies versioned migrations. Never edit applied SQL or delete `drizzle/meta/` as cleanup.

Review private shipping/campaign receipts before retrying a send. Ambiguous accepted provider calls must not be replayed blindly.

## Storefront/preorder changes

`lib/salesMode.ts` controls advertised mode, price and campaign date. `lib/pricing.ts` calculates current totals while preserving historical pricing versions. Batch allocation logic in `lib/inventory/preorders.ts` and `lib/inventory/purchaseStore.ts` still owns historical promises.

When changing a campaign: update current copy/date/price coherently, run pricing/preorder/stock tests, check product/cart/checkout messaging, and verify stock configuration. Turning off preorder display does not erase paid preorder obligations or mean a shipment has arrived. Receive stock through the existing fulfilment workflow.

## Performance and failures

Use Vercel Speed Insights for production LCP, INP and CLS on home/product/checkout. Compare mobile p75 before and after deployment. Browser tests record deterministic request behavior; they do not substitute for production field data.

Inspect failed cron responses, payment manual-review records, and email-audit issues. Keep tokens/customer payloads out of logs. Route-level error pages provide retry/navigation without exposing internal error messages.
