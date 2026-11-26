# Architecture

## Folder map

- `app/`: routing and HTTP entry points. The root layout provides fonts and document metadata.
- `app/(shop)/`: shared cart, header and footer. `(public)` adds analytics/attribution; `(private)` holds token-bearing customer links without those components.
- `app/admin/`: standalone back office, with optional panels loaded on demand.
- `app/api/`: validates requests and delegates to business modules. Admin routes check sessions and mutation origins; cron routes check `CRON_SECRET`.
- `components/`: reusable storefront UI; `components/ui/` contains visual primitives.
- `lib/`: business rules, services and client hooks. `db/`, `admin/`, `customHats/`, `research/`, `emails/`, `payments/`, `checkout/`, `inventory/`, and `http/` group related responsibilities. Payment ingestion/reconciliation and stock/reservation logic live together with their tests. Root modules cover product/pricing, reviews, attribution and the remaining commerce adapters.
- `content/`: editorial copy and validated manual review data.
- `drizzle/`: immutable applied SQL migrations and generator metadata.
- `scripts/`: operator commands, migration tooling and isolated test runners.
- `.local/`: ignored private records, captures and scratch work, never application source.

## Purchase flow

1. Cart state persists in browser localStorage. Inventory consumers share a deduplicated cache with visibility-aware polling. A closed drawer does not subscribe.
2. `/api/checkout` validates bounded JSON, the delivery address, and server-calculated prices; a shared Redis limit precedes reservation/provider work.
3. Inventory and voucher reservations prevent concurrent overselling. Paystack receives frozen order metadata.
4. The browser opens the payment popup or hosted fallback. Return-page verification and signed webhooks confirm the payment server-side.
5. The selected payment adapter commits purchase effects. Existing idempotency/receipt semantics prevent blind notification replay.
6. Admin fulfilment verifies payment before shipping; shipping emails retain delivery receipts and retry history.

Historical pricing versions are deliberate: old paid orders must not be repriced using current campaigns.

## Data and services

| Service | Responsibility |
| --- | --- |
| Paystack | Payment provider and verification |
| Neon PostgreSQL / Drizzle | Reviews, custom-design records, research; prepared order/event migration |
| Upstash Redis | Inventory/reservations, sessions, limits, communication receipts, legacy order fulfilment state |
| Resend | Transactional and follow-up email delivery |
| Vercel Blob | Review photos |
| Cloudflare R2 | Private custom-design files |
| Google Maps | Optional address autocomplete and delivery map |
| OpenAI | Optional product questions and background review ranking |

Authoritative domain ownership is tracked in [migration status](migration-status.md), not inferred from tables merely existing.

`lib/errors.ts` defines expected application failures. `lib/db/sharedRedis.ts` owns the Redis transport. Legacy `AdminError`/`adminStore` exports remain compatibility names, not a separate database.

## Boundaries

- Server credentials stay in server modules. Browser-facing environment variables use `NEXT_PUBLIC_` intentionally.
- Route layouts separate private links from analytics. Keep token URLs out of logs/tracking payloads.
- SQL errors never trigger fallback writes into a stale Redis business store.
- Marketing consent remains assumed from the owner's off-site opt-in process. The checkout flag preserves that business rule; it does not represent a website checkbox.
