# Smelt Transactional Email Suite — Design

**Date:** 2026-07-04
**Status:** Approved for planning

## Context

Smelt (hand-felted sauna hats, Cape Town) sends two plain-HTML emails today: a
customer receipt and an owner alert, both fired on payment success from
`lib/email.ts`. The `saunahat.co.za` domain is now verified in Resend and
sending works.

We want a full, on-brand transactional email suite covering the customer's whole
journey — confirmation, abandoned cart recovery, shipping/tracking, delivery
follow-up, payment failure, and newsletter welcome — all visually matching the
website. Today only order confirmation has the data it needs; abandoned cart and
shipping require new backing infrastructure (server-side cart capture, a
scheduled job, fulfillment/address fields, and an admin trigger). This spec
covers building that infrastructure and all seven emails on a shared branded
layout.

## Goals

- A reusable, email-client-safe branded layout every email shares.
- Seven emails wired to real triggers (see table).
- Server-side cart capture + Vercel Cron for abandoned-cart recovery.
- Fulfillment/tracking + shipping address on orders, driven by a simple admin page.
- Everything degrades gracefully when `RESEND_API_KEY` / `DATABASE_URL` are unset
  (matching the existing no-op pattern).

## Non-Goals

- Pixel-perfect web-font matching in email (clients strip web fonts; we evoke, not match).
- Carrier webhook integration for tracking (admin marks shipped manually).
- Multi-touch abandoned-cart sequences (single reminder at ~4h).

---

## Section 1 — Shared branded email layout

New directory `lib/emails/`. Core module `lib/emails/layout.ts`:

```
renderEmail({ preheader, heading, intro, blocks, cta?, signoff? }): { html, text }
```

- **Table-based HTML with fully inline styles** — no `<style>` blocks, no external
  CSS (Gmail/Outlook strip them).
- **Colors** (from the site's design tokens): paper `#F6F1E3`, ink `#0E3B2A`,
  ink-deep `#0A2C20`, terracotta `#E4633C` (CTA), peach `#F2A98C` (accents).
- **CTA buttons:** pill (`border-radius:999px`), terracotta bg, paper text,
  `padding:16px 26px`, `font-weight:600`.
- **Cards:** `border-radius:24px`, `1px solid rgba(14,59,42,0.2)`, paper bg.
- **Fonts:** declare Space Grotesk / Bricolage for clients that honor web fonts,
  with a system fallback stack `-apple-system, "Segoe UI", Helvetica, Arial,
  sans-serif`. Headings use heavier weight + `letter-spacing:-0.02em` to echo
  Bricolage.
- **Header:** centered "Smelt" wordmark + a hosted hat image referenced by
  absolute URL off the production domain (see Open Questions on base URL);
  `public/images/hat-green-front-nobg.png`.
- **Footer:** "Warm regards,\nTom & Marc", "Hand-felted in Cape Town. 100% merino
  wool.", ticker taglines, and an unsubscribe/contact line.
- **Text version:** always generated alongside HTML for deliverability.

Reusable helpers in `lib/emails/components.ts`: `orderItemsTable(items)`,
`moneyRow(label, value)`, `button(label, url)`, `addressBlock(address)`.

Each email is a small module (e.g. `lib/emails/orderConfirmation.ts`) that returns
`{ subject, html, text }` by calling `renderEmail`. `lib/email.ts` remains the
orchestrator that talks to Resend.

---

## Section 2 — Data & infrastructure changes

### `orders` table — new columns (added idempotently in `ensureSchema`, `lib/db.ts`)

Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements after the `CREATE TABLE`:

- `customer_name TEXT`
- `shipping_address JSONB` — `{ line1, line2?, city, postalCode, province, country, phone? }`
- `fulfillment_status TEXT NOT NULL DEFAULT 'pending'` — `pending` → `shipped` → `delivered`
- `tracking_number TEXT`, `tracking_carrier TEXT`, `tracking_url TEXT`
- `shipped_at TIMESTAMPTZ`, `delivered_at TIMESTAMPTZ`

`RecordOrderInput` (`lib/orders.ts`) gains optional `customerName` and
`shippingAddress`; the upsert writes them. New helpers: `listOrders()`,
`markShipped(reference, {carrier, trackingNumber, trackingUrl})`,
`markDelivered(reference)` — each returns the updated order so the caller can
fire the matching email.

### New `abandoned_carts` table

```
id BIGSERIAL PK, email TEXT NOT NULL UNIQUE, name TEXT,
items JSONB NOT NULL DEFAULT '[]', amount_rand INTEGER NOT NULL,
created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
reminded_at TIMESTAMPTZ, converted_at TIMESTAMPTZ
```

Module `lib/carts.ts`: `trackCart({email,name,items,amountRand})` (upsert by email,
bump `updated_at`, clear `reminded_at` on change), `markCartConverted(email)`,
`findAbandonedCarts({olderThanMinutes, notRemindedSince})`, `stampReminded(email)`.

### New `subscribers` table (for welcome email)

```
id BIGSERIAL PK, email TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT now()
```

Module `lib/subscribers.ts`: `addSubscriber(email)` → returns true if newly added.

### Checkout changes

- **`app/checkout/page.tsx`:** add Name + shipping address fields (line1, line2,
  city, postal code, province, country [default South Africa], optional phone).
  On email blur (valid email + non-empty cart), fire `POST /api/cart/track`.
- **`app/api/checkout/route.ts`:** accept + validate name/address; include in
  Paystack `metadata` alongside `items`/`amountRand`.
- **`app/api/paystack/webhook/route.ts`** and **`app/api/checkout/verify/route.ts`:**
  pass `customerName`/`shippingAddress` from metadata into `recordOrder`, and call
  `markCartConverted(email)` on success.

### New API routes

- `POST /api/cart/track` — upsert abandoned_carts (validate email; sanitize cart
  server-side via existing `sanitizeCart`/`cartSubtotal` logic).
- `GET /api/cron/abandoned-carts` — guarded by `Authorization: Bearer $CRON_SECRET`.
  Finds carts >4h old, `converted_at IS NULL`, `reminded_at IS NULL`; sends the
  abandoned-cart email; stamps `reminded_at`.
- `POST /api/newsletter` — `addSubscriber(email)`; on newly added, send welcome email.
- `POST /api/admin/orders/ship` and `/api/admin/orders/deliver` — admin-auth guarded;
  call `markShipped`/`markDelivered` then fire the email.

### `vercel.json`

```json
{ "crons": [ { "path": "/api/cron/abandoned-carts", "schedule": "0 * * * *" } ] }
```

Hourly; the 4h age check lives in the query, not the schedule.

### Admin page (`app/admin/page.tsx` + `lib/adminAuth.ts`)

Single-password gate: compare a submitted password (stored in an httpOnly cookie
after login) against `ADMIN_PASSWORD` server-side. Page lists orders via
`listOrders()` with per-order "Mark shipped" (carrier + tracking # + optional URL)
and "Mark delivered" actions. All order queries and mutations are server-side.

---

## Section 3 — The seven emails & triggers

| # | Email | Trigger | Recipient | Module |
|---|-------|---------|-----------|--------|
| 1 | Order confirmation (redesign) | payment success (`sendOrderEmails`) | customer | `orderConfirmation.ts` |
| 2 | Owner new-order alert (redesign) | payment success | owner(s) via `ORDER_NOTIFY_EMAIL` | `ownerAlert.ts` |
| 3 | Payment failed | webhook `charge.failed` | customer | `paymentFailed.ts` |
| 4 | Abandoned cart | cron, >4h, not converted/reminded | customer | `abandonedCart.ts` |
| 5 | Shipping / on its way | admin "Mark shipped" | customer | `shipping.ts` |
| 6 | Delivered follow-up | admin "Mark delivered" | customer | `delivered.ts` |
| 7 | Welcome / list opt-in | footer newsletter signup (`POST /api/newsletter`) | subscriber | `welcome.ts` |

Content notes:
- **Confirmation:** reference, items table, total, "hand-felted...founding batch,
  four to six weeks" messaging, shipping address echo, "Warm regards, Tom & Marc".
- **Payment failed:** reassuring tone, CTA button back to `/checkout`.
- **Abandoned cart:** "Your hat is still warming up", items, CTA back to cart/checkout.
- **Shipping:** carrier + tracking number + tracking URL button.
- **Delivered:** warm follow-up, gentle ask for feedback/photo.
- **Welcome:** brand intro, what to expect.

`lib/email.ts` gains: `sendOrderEmails` (redesigned, now also passes address),
`sendPaymentFailedEmail`, `sendAbandonedCartEmail`, `sendShippingEmail`,
`sendDeliveredEmail`, `sendWelcomeEmail`. Existing safety pattern preserved:
`isEmailConfigured()` gate, `Promise.allSettled`, swallow+log failures.

### Webhook addition

Handle `event.event === "charge.failed"` → look up email/items from
`event.data` → `sendPaymentFailedEmail`. (No DB write required; best-effort.)

### Footer wiring

`components/Footer.tsx` signup form currently calls `preventDefault()` only. Wire
it to `POST /api/newsletter` with basic success/error states.

---

## New environment variables

Add to `.env.local.example` (and Vercel project settings for production):

- `CRON_SECRET` — bearer token the cron route checks.
- `ADMIN_PASSWORD` — admin page gate.
- `NEXT_PUBLIC_SITE_URL` (or `SITE_URL`) — absolute base for email image/CTA URLs
  (falls back to request origin where available; cron/admin have no request origin,
  so an env value is required for correct links there).

---

## Verification

1. **Layout unit render:** a dev-only script (or route `/api/dev/preview-email?type=...`,
   guarded to non-production) renders each email's HTML to eyeball in a browser.
2. **Confirmation + owner alert:** run a test payment (Paystack test key) end-to-end;
   confirm both emails arrive and render on Gmail + Apple Mail.
3. **Payment failed:** trigger a failed test charge; confirm email.
4. **Abandoned cart:** enter email on checkout, don't pay; temporarily lower the age
   threshold; hit `/api/cron/abandoned-carts` with the bearer token; confirm email
   and that a subsequent payment marks the cart converted (no duplicate reminder).
5. **Shipping + delivered:** via `/admin`, mark a test order shipped (with tracking)
   then delivered; confirm both emails with correct tracking link.
6. **Welcome:** submit the footer form; confirm subscriber row + welcome email;
   resubmitting the same email does not re-send.
7. **Graceful degradation:** with `RESEND_API_KEY` unset, all sends are silent no-ops;
   with `DATABASE_URL` unset, cart/subscriber/admin features degrade without errors.
8. **`npm run build`** passes (TypeScript strict).

## Open questions / risks

- **Deliverability:** brand-new sending domain → early mail may hit spam until
  reputation builds; confirm SPF/DKIM (Resend-managed) and consider a DMARC record.
- **Admin auth is intentionally minimal** (single shared password). Acceptable for
  two founders; revisit if the team grows.
- **Abandoned-cart privacy:** we store email + cart pre-purchase; the reminder must
  include an unsubscribe/contact line.
