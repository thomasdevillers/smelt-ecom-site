# Smelt Transactional Email Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build seven on-brand transactional emails (confirmation, owner alert, payment failed, abandoned cart, shipping, delivered, welcome) on a shared branded layout, plus the data/infra to trigger them (server-side cart capture + Vercel Cron, order fulfillment/address fields, a simple admin page, newsletter wiring).

**Architecture:** A shared `lib/emails/layout.ts` renders email-client-safe table-based HTML from brand tokens; one module per email calls it. `lib/email.ts` stays the Resend orchestrator. Postgres gains fulfillment/address columns plus `abandoned_carts` and `subscribers` tables. New API routes fire emails on their triggers; Vercel Cron drives abandoned-cart recovery; a password-gated `/admin` page drives shipping/delivery.

**Tech Stack:** Next.js 16.2.10 (App Router — read `node_modules/next/dist/docs/` before writing route/page code; this is a modified Next), React 19, `pg`, Resend, Vitest.

**Conventions:** All email/DB features degrade to silent no-ops when `RESEND_API_KEY` / `DATABASE_URL` are unset (match existing pattern in `lib/email.ts`, `lib/db.ts`). Tests use Vitest for pure logic; API routes and UI use documented manual verification. Commit after each task.

---

## File Structure

**Create:**
- `lib/emails/theme.ts` — brand tokens (colors, font stack, base URL helper).
- `lib/emails/layout.ts` — `renderEmail()` → `{ html, text }`.
- `lib/emails/components.ts` — `orderItemsTable`, `moneyRow`, `button`, `addressBlock`.
- `lib/emails/orderConfirmation.ts`, `ownerAlert.ts`, `paymentFailed.ts`, `abandonedCart.ts`, `shipping.ts`, `delivered.ts`, `welcome.ts` — each returns `{ subject, html, text }`.
- `lib/emails/*.test.ts` — render tests for pure email modules.
- `lib/carts.ts` — abandoned-cart persistence + `lib/address.ts` (sanitize/validate address).
- `lib/subscribers.ts` — subscriber persistence.
- `lib/adminAuth.ts` — password check + guard helper.
- `app/api/cart/track/route.ts`, `app/api/cron/abandoned-carts/route.ts`, `app/api/newsletter/route.ts`, `app/api/admin/orders/ship/route.ts`, `app/api/admin/orders/deliver/route.ts`.
- `app/admin/page.tsx`, `app/admin/admin.module.css`.
- `vercel.json`.

**Modify:**
- `lib/db.ts` — new columns + tables in `ensureSchema`.
- `lib/orders.ts` — extend `RecordOrderInput`; add `listOrders`, `markShipped`, `markDelivered`.
- `lib/email.ts` — swap to shared layout; add new `send*` functions.
- `lib/address.ts` shared with checkout route.
- `app/checkout/page.tsx` + `app/checkout/checkout.module.css` — name/address fields, cart-track on blur.
- `app/api/checkout/route.ts` — accept/validate address, add to metadata.
- `app/api/paystack/webhook/route.ts` — pass address to `recordOrder`, mark cart converted, handle `charge.failed`.
- `app/api/checkout/verify/route.ts` — pass address, mark cart converted.
- `components/Footer.tsx` — wire signup form to `/api/newsletter`.
- `.env.local.example` — `CRON_SECRET`, `ADMIN_PASSWORD`, `SITE_URL`.

---

## Phase 1 — Email foundation

### Task 1: Brand theme tokens

**Files:**
- Create: `lib/emails/theme.ts`
- Test: `lib/emails/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { COLORS, FONT_STACK, absoluteUrl } from "./theme";

describe("email theme", () => {
  it("exposes brand colors", () => {
    expect(COLORS.paper).toBe("#F6F1E3");
    expect(COLORS.ink).toBe("#0E3B2A");
    expect(COLORS.terracotta).toBe("#E4633C");
  });

  it("builds absolute urls from SITE_URL", () => {
    expect(absoluteUrl("/images/x.png", "https://saunahat.co.za")).toBe(
      "https://saunahat.co.za/images/x.png",
    );
  });

  it("strips a trailing slash on the base", () => {
    expect(absoluteUrl("/a", "https://x.co/")).toBe("https://x.co/a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/emails/theme.test.ts`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/emails/theme.ts
export const COLORS = {
  paper: "#F6F1E3",
  paperWarm: "#FBF7EC",
  ink: "#0E3B2A",
  inkDeep: "#0A2C20",
  terracotta: "#E4633C",
  peach: "#F2A98C",
  inkSoft: "rgba(14,59,42,0.75)",
  border: "rgba(14,59,42,0.2)",
} as const;

export const FONT_STACK =
  '"Space Grotesk", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

/** Absolute URL for email assets/links. base defaults to SITE_URL env. */
export function absoluteUrl(path: string, base = process.env.SITE_URL ?? ""): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/emails/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/emails/theme.ts lib/emails/theme.test.ts
git commit -m "feat(email): brand theme tokens for email templates"
```

### Task 2: Shared layout renderer

**Files:**
- Create: `lib/emails/layout.ts`
- Test: `lib/emails/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";

describe("renderEmail", () => {
  const out = renderEmail({
    preheader: "Peek text",
    heading: "Your pre-order is confirmed",
    intro: "Thanks for pre-ordering.",
    blocks: ["<p>Body block</p>"],
    cta: { label: "View", url: "https://saunahat.co.za/x" },
  });

  it("returns html and text", () => {
    expect(out.html).toContain("<html");
    expect(typeof out.text).toBe("string");
  });

  it("includes heading, preheader and cta in html", () => {
    expect(out.html).toContain("Your pre-order is confirmed");
    expect(out.html).toContain("Peek text");
    expect(out.html).toContain("https://saunahat.co.za/x");
  });

  it("uses inline styles, not a style block", () => {
    expect(out.html).not.toContain("</style>");
    expect(out.html).toContain("style=");
  });

  it("text version is plain and includes heading + cta url", () => {
    expect(out.text).toContain("Your pre-order is confirmed");
    expect(out.text).toContain("https://saunahat.co.za/x");
    expect(out.text).not.toContain("<");
  });

  it("signs off warmly by default", () => {
    expect(out.text).toContain("Warm regards");
    expect(out.text).toContain("Tom & Marc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/emails/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/emails/layout.ts
import { COLORS, FONT_STACK, absoluteUrl } from "./theme";

export interface Cta {
  label: string;
  url: string;
}

export interface EmailInput {
  preheader: string;
  heading: string;
  intro?: string;
  blocks?: string[]; // trusted HTML fragments built by components.ts
  cta?: Cta;
  signoff?: string; // defaults to the warm signoff
}

const DEFAULT_SIGNOFF = "Warm regards,<br/>Tom &amp; Marc";

function ctaHtml(cta: Cta): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">` +
    `<tr><td style="border-radius:999px;background:${COLORS.terracotta};">` +
    `<a href="${cta.url}" style="display:inline-block;padding:16px 26px;` +
    `font-family:${FONT_STACK};font-weight:600;font-size:15px;color:${COLORS.paper};` +
    `text-decoration:none;border-radius:999px;">${cta.label}</a>` +
    `</td></tr></table>`
  );
}

export function renderEmail(input: EmailInput): { html: string; text: string } {
  const { preheader, heading, intro, blocks = [], cta } = input;
  const signoff = input.signoff ?? DEFAULT_SIGNOFF;
  const hat = absoluteUrl("/images/hat-green-front-nobg.png");

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.paper};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">` +
    // Header
    `<tr><td align="center" style="padding-bottom:8px;">` +
    `<img src="${hat}" width="96" height="96" alt="Smelt" style="display:block;"/>` +
    `<div style="font-family:${FONT_STACK};font-weight:700;font-size:22px;color:${COLORS.ink};letter-spacing:-0.02em;padding-top:8px;">Smelt</div>` +
    `</td></tr>` +
    // Card
    `<tr><td style="background:${COLORS.paperWarm};border:1px solid ${COLORS.border};border-radius:24px;padding:28px;">` +
    `<h1 style="margin:0 0 12px;font-family:${FONT_STACK};font-weight:800;font-size:26px;line-height:1.1;letter-spacing:-0.02em;color:${COLORS.ink};">${heading}</h1>` +
    (intro ? `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.inkSoft};">${intro}</p>` : "") +
    blocks.join("") +
    (cta ? ctaHtml(cta) : "") +
    `<p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${signoff}</p>` +
    `</td></tr>` +
    // Footer
    `<tr><td align="center" style="padding:24px 8px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.inkSoft};">` +
    `Hand-felted in Cape Town. 100% merino wool.<br/>` +
    `100% WOOL FELT · EMBROIDERED, NOT PRINTED · MADE TO SWEAT IN` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+\n/g, "\n").trim();
  const text = [
    heading,
    "",
    intro ?? "",
    ...blocks.map(stripTags),
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    "Warm regards,",
    "Tom & Marc",
    "",
    "Hand-felted in Cape Town. 100% merino wool.",
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/emails/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/emails/layout.ts lib/emails/layout.test.ts
git commit -m "feat(email): shared branded email layout renderer"
```

### Task 3: Reusable content components

**Files:**
- Create: `lib/emails/components.ts`
- Test: `lib/emails/components.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { orderItemsTable, moneyRow, addressBlock } from "./components";

describe("email components", () => {
  it("renders an items table with names and quantities", () => {
    const html = orderItemsTable([{ colour: "green", name: "Forest Green", qty: 2 }]);
    expect(html).toContain("Forest Green");
    expect(html).toContain("2");
  });

  it("handles no items", () => {
    expect(orderItemsTable([])).toContain("no line items");
  });

  it("renders a money row with label and value", () => {
    const html = moneyRow("Total", "R1 044");
    expect(html).toContain("Total");
    expect(html).toContain("R1 044");
  });

  it("renders an address block", () => {
    const html = addressBlock({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001",
      province: "WC", country: "South Africa",
    });
    expect(html).toContain("1 Main Rd");
    expect(html).toContain("Cape Town");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/emails/components.test.ts`
Expected: FAIL — cannot resolve `./components`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/emails/components.ts
import { COLORS, FONT_STACK } from "./theme";
import type { OrderItem } from "../orders";
import type { ShippingAddress } from "../address";

const cell = `font-family:${FONT_STACK};font-size:15px;color:${COLORS.ink};padding:8px 0;`;

export function orderItemsTable(items: OrderItem[]): string {
  if (!items.length)
    return `<p style="${cell}">(no line items recorded)</p>`;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="${cell}border-bottom:1px solid ${COLORS.border};">${i.name}</td>` +
        `<td align="right" style="${cell}border-bottom:1px solid ${COLORS.border};">× ${i.qty}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

export function moneyRow(label: string, value: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">` +
    `<tr><td style="${cell}font-weight:600;">${label}</td>` +
    `<td align="right" style="${cell}font-weight:600;">${value}</td></tr></table>`
  );
}

export function addressBlock(a: ShippingAddress): string {
  const lines = [a.line1, a.line2, `${a.city}, ${a.province} ${a.postalCode}`, a.country, a.phone]
    .filter(Boolean)
    .join("<br/>");
  return `<p style="${cell}">${lines}</p>`;
}

export function button(): never {
  throw new Error("Use the cta option on renderEmail instead of a standalone button.");
}
```

Note: CTAs are rendered by `renderEmail`'s `cta` option (Task 2); `button` is intentionally not a separate helper. Do not call it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/emails/components.test.ts`
Expected: PASS (needs `ShippingAddress` from Task 4 — do Task 4 first if the import fails, or stub the type; see Task 4).

- [ ] **Step 5: Commit**

```bash
git add lib/emails/components.ts lib/emails/components.test.ts
git commit -m "feat(email): reusable items/money/address components"
```

> **Ordering note:** `components.ts` imports `ShippingAddress` from `lib/address.ts` (Task 4). Do **Task 4 before Task 3**, or the type import will fail. Tasks are listed in dependency order below except this pair — implement Task 4 first.

---

## Phase 2 — Address helper & data layer

### Task 4: Shipping address type + sanitizer

**Files:**
- Create: `lib/address.ts`
- Test: `lib/address.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { sanitizeAddress, isCompleteAddress } from "./address";

describe("address", () => {
  it("trims and keeps known fields", () => {
    const a = sanitizeAddress({
      line1: " 1 Main Rd ", line2: "", city: "Cape Town",
      postalCode: "8001", province: "WC", country: "", phone: "0821234567",
      junk: "x",
    });
    expect(a.line1).toBe("1 Main Rd");
    expect(a.country).toBe("South Africa"); // default
    expect((a as Record<string, unknown>).junk).toBeUndefined();
  });

  it("flags incomplete addresses", () => {
    expect(isCompleteAddress(sanitizeAddress({ line1: "", city: "", postalCode: "", province: "" }))).toBe(false);
    expect(isCompleteAddress(sanitizeAddress({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC",
    }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/address.test.ts`
Expected: FAIL — cannot resolve `./address`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/address.ts
export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  phone?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function sanitizeAddress(input: unknown): ShippingAddress {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    line1: str(c.line1),
    line2: str(c.line2) || undefined,
    city: str(c.city),
    postalCode: str(c.postalCode),
    province: str(c.province),
    country: str(c.country) || "South Africa",
    phone: str(c.phone) || undefined,
  };
}

export function isCompleteAddress(a: ShippingAddress): boolean {
  return Boolean(a.line1 && a.city && a.postalCode && a.province);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/address.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/address.ts lib/address.test.ts
git commit -m "feat: shipping address type and sanitizer"
```

### Task 5: Extend DB schema

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add columns and tables in `ensureSchema`**

In `lib/db.ts`, inside the `ensureSchema` IIFE, after the existing `CREATE TABLE orders` query, add:

```ts
      await getPool().query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS customer_name      TEXT,
          ADD COLUMN IF NOT EXISTS shipping_address    JSONB,
          ADD COLUMN IF NOT EXISTS fulfillment_status  TEXT NOT NULL DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS tracking_number     TEXT,
          ADD COLUMN IF NOT EXISTS tracking_carrier    TEXT,
          ADD COLUMN IF NOT EXISTS tracking_url        TEXT,
          ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ;
      `);

      await getPool().query(`
        CREATE TABLE IF NOT EXISTS abandoned_carts (
          id           BIGSERIAL PRIMARY KEY,
          email        TEXT NOT NULL UNIQUE,
          name         TEXT,
          items        JSONB NOT NULL DEFAULT '[]'::jsonb,
          amount_rand  INTEGER NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          reminded_at  TIMESTAMPTZ,
          converted_at TIMESTAMPTZ
        );
      `);

      await getPool().query(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id         BIGSERIAL PRIMARY KEY,
          email      TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat(db): fulfillment/address columns + carts & subscribers tables"
```

### Task 6: Extend orders module

**Files:**
- Modify: `lib/orders.ts`

- [ ] **Step 1: Extend `RecordOrderInput` and write it**

In `lib/orders.ts`, import the address type and extend the interface + upsert:

```ts
import type { ShippingAddress } from "./address";
```

Add to `RecordOrderInput`:

```ts
  customerName?: string | null;
  shippingAddress?: ShippingAddress | null;
```

Update the INSERT to include the two columns (append to column list, values, and the `ON CONFLICT DO UPDATE SET`):

```ts
  const { rows } = await getPool().query(
    `
    INSERT INTO orders
      (reference, email, amount_rand, currency, status, items, paid_at, customer_name, shipping_address)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
    ON CONFLICT (reference) DO UPDATE
      SET status           = EXCLUDED.status,
          paid_at          = COALESCE(orders.paid_at, EXCLUDED.paid_at),
          email            = EXCLUDED.email,
          customer_name    = COALESCE(EXCLUDED.customer_name, orders.customer_name),
          shipping_address = COALESCE(EXCLUDED.shipping_address, orders.shipping_address)
    RETURNING (xmax = 0) AS inserted, status, paid_at
    `,
    [
      input.reference, input.email, input.amountRand, input.currency ?? "ZAR",
      input.status, JSON.stringify(input.items ?? []), input.paidAt ?? null,
      input.customerName ?? null,
      input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
    ],
  );
```

- [ ] **Step 2: Add `Order` type + query/mutation helpers**

Append to `lib/orders.ts`:

```ts
export interface Order {
  reference: string;
  email: string;
  customerName: string | null;
  amountRand: number;
  status: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress | null;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrder(r: any): Order {
  return {
    reference: r.reference, email: r.email, customerName: r.customer_name,
    amountRand: r.amount_rand, status: r.status, items: r.items ?? [],
    shippingAddress: r.shipping_address, fulfillmentStatus: r.fulfillment_status,
    trackingNumber: r.tracking_number, trackingCarrier: r.tracking_carrier,
    trackingUrl: r.tracking_url, paidAt: r.paid_at, shippedAt: r.shipped_at,
    deliveredAt: r.delivered_at, createdAt: r.created_at,
  };
}

export async function listOrders(limit = 200): Promise<Order[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [limit],
  );
  return rows.map(mapOrder);
}

export async function markShipped(
  reference: string,
  t: { carrier: string; trackingNumber: string; trackingUrl?: string },
): Promise<Order | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `UPDATE orders SET fulfillment_status='shipped', tracking_carrier=$2,
       tracking_number=$3, tracking_url=$4, shipped_at=COALESCE(shipped_at, now())
     WHERE reference=$1 RETURNING *`,
    [reference, t.carrier, t.trackingNumber, t.trackingUrl ?? null],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function markDelivered(reference: string): Promise<Order | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `UPDATE orders SET fulfillment_status='delivered',
       delivered_at=COALESCE(delivered_at, now()) WHERE reference=$1 RETURNING *`,
    [reference],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/orders.ts
git commit -m "feat(orders): address fields + listOrders/markShipped/markDelivered"
```

### Task 7: Abandoned-cart persistence

**Files:**
- Create: `lib/carts.ts`

- [ ] **Step 1: Implement**

```ts
// lib/carts.ts
import { ensureSchema, getPool, isDbConfigured } from "./db";
import type { OrderItem } from "./orders";

export interface AbandonedCart {
  email: string;
  name: string | null;
  items: OrderItem[];
  amountRand: number;
}

/** Upsert a cart by email. New/changed content clears any prior reminder. */
export async function trackCart(input: {
  email: string; name?: string | null; items: OrderItem[]; amountRand: number;
}): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  await getPool().query(
    `INSERT INTO abandoned_carts (email, name, items, amount_rand)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (email) DO UPDATE
       SET name=EXCLUDED.name, items=EXCLUDED.items, amount_rand=EXCLUDED.amount_rand,
           updated_at=now(), reminded_at=NULL
       WHERE abandoned_carts.converted_at IS NULL`,
    [input.email, input.name ?? null, JSON.stringify(input.items), input.amountRand],
  );
}

export async function markCartConverted(email: string): Promise<void> {
  if (!isDbConfigured() || !email) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE abandoned_carts SET converted_at=now() WHERE email=$1 AND converted_at IS NULL`,
    [email],
  );
}

/** Carts older than `minutes`, not converted, not yet reminded. */
export async function findAbandonedCarts(minutes: number): Promise<AbandonedCart[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT email,name,items,amount_rand FROM abandoned_carts
     WHERE converted_at IS NULL AND reminded_at IS NULL
       AND updated_at < now() - ($1 || ' minutes')::interval
       AND amount_rand > 0`,
    [String(minutes)],
  );
  return rows.map((r) => ({
    email: r.email, name: r.name, items: r.items ?? [], amountRand: r.amount_rand,
  }));
}

export async function stampReminded(email: string): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE abandoned_carts SET reminded_at=now() WHERE email=$1`, [email],
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add lib/carts.ts
git commit -m "feat: abandoned cart persistence helpers"
```

### Task 8: Subscriber persistence

**Files:**
- Create: `lib/subscribers.ts`

- [ ] **Step 1: Implement**

```ts
// lib/subscribers.ts
import { ensureSchema, getPool, isDbConfigured } from "./db";

/** Returns true only if this email was newly added (so we welcome once). */
export async function addSubscriber(email: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  await ensureSchema();
  const { rows } = await getPool().query(
    `INSERT INTO subscribers (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email],
  );
  return rows.length > 0;
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add lib/subscribers.ts
git commit -m "feat: subscriber persistence helper"
```

---

## Phase 3 — Email modules

Each module is pure (no I/O) and returns `{ subject, html, text }`. One representative task is shown in full (Task 9); the remaining modules (Tasks 10–15) follow the identical shape — a test asserting subject + key content, then an implementation calling `renderEmail`. **Repeat the full pattern for each; do not abbreviate in the module files.**

### Task 9: Order confirmation email

**Files:**
- Create: `lib/emails/orderConfirmation.ts`
- Test: `lib/emails/orderConfirmation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { orderConfirmationEmail } from "./orderConfirmation";

describe("orderConfirmationEmail", () => {
  const e = orderConfirmationEmail({
    reference: "ref_123", total: "R1 044",
    items: [{ colour: "green", name: "Forest Green", qty: 2 }],
    address: { line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC", country: "South Africa" },
  });
  it("has a warm subject", () => {
    expect(e.subject).toMatch(/confirmed/i);
  });
  it("includes reference, total, item and address", () => {
    expect(e.html).toContain("ref_123");
    expect(e.html).toContain("R1 044");
    expect(e.html).toContain("Forest Green");
    expect(e.html).toContain("Cape Town");
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npm run test -- lib/emails/orderConfirmation.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

```ts
// lib/emails/orderConfirmation.ts
import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow, addressBlock } from "./components";
import { absoluteUrl } from "./theme";
import type { OrderItem } from "../orders";
import type { ShippingAddress } from "../address";

export function orderConfirmationEmail(d: {
  reference: string; total: string; items: OrderItem[]; address?: ShippingAddress | null;
}): { subject: string; html: string; text: string } {
  const blocks = [
    `<p style="font-family:inherit">Order reference: <strong>${d.reference}</strong></p>`,
    orderItemsTable(d.items),
    moneyRow("Total paid", d.total),
    d.address ? `<p><strong>Shipping to:</strong></p>${addressBlock(d.address)}` : "",
    `<p>Every hat is hand-felted to order, so your pre-order ships with the founding batch, roughly four to six weeks out. We'll be in touch when it's on its way.</p>`,
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: "Your Smelt pre-order is confirmed.",
    heading: "Your pre-order is confirmed",
    intro: "Thanks for pre-ordering a Smelt sauna hat.",
    blocks,
    cta: { label: "Visit Smelt", url: absoluteUrl("/") },
  });
  return { subject: "Your Smelt pre-order is confirmed. Warm regards.", html, text };
}
```

- [ ] **Step 4: Run → PASS**; **Step 5: Commit**

```bash
git add lib/emails/orderConfirmation.ts lib/emails/orderConfirmation.test.ts
git commit -m "feat(email): order confirmation template"
```

### Task 10: Owner alert email (`lib/emails/ownerAlert.ts`)

Same pattern. `ownerAlert.ts` exports `ownerAlertEmail({ reference, email, total, items, address })`. Subject: `New Smelt order: ${total} (${reference})`. Body: reference, customer email, total, items table, address block. Test asserts subject contains the total and reference, and body contains the customer email. Commit `feat(email): owner new-order alert template`.

### Task 11: Payment failed email (`lib/emails/paymentFailed.ts`)

`paymentFailedEmail({ items?, retryUrl })`. Subject: "Your Smelt payment didn't go through". Reassuring tone; CTA button `label:"Try again"`, `url: retryUrl` (checkout URL). Test asserts subject matches `/didn.t go through/i` and html contains the retry url. Commit `feat(email): payment failed template`.

### Task 12: Abandoned cart email (`lib/emails/abandonedCart.ts`)

`abandonedCartEmail({ name?, items, total, cartUrl })`. Subject: "Your Smelt hat is still warming up". Greets by name when present. Items table + total + CTA `label:"Finish your order"`, `url: cartUrl`. Footer must include a contact/opt-out line (add a `signoff` or extra block noting "Reply to this email to be removed."). Test asserts subject matches `/warming up/i`, html contains cartUrl and an opt-out phrase. Commit `feat(email): abandoned cart template`.

### Task 13: Shipping email (`lib/emails/shipping.ts`)

`shippingEmail({ name?, carrier, trackingNumber, trackingUrl?, items })`. Subject: "Your Smelt hat is on its way". Body: carrier + tracking number; CTA `label:"Track your parcel"`, `url: trackingUrl` only when present (omit CTA otherwise). Test asserts subject matches `/on its way/i` and html contains the tracking number. Commit `feat(email): shipping/tracking template`.

### Task 14: Delivered email (`lib/emails/delivered.ts`)

`deliveredEmail({ name? })`. Subject: "Your Smelt hat has landed". Warm follow-up; gentle ask to reply with a photo/feedback; CTA to the site. Test asserts subject matches `/landed|delivered/i`. Commit `feat(email): delivered follow-up template`.

### Task 15: Welcome email (`lib/emails/welcome.ts`)

`welcomeEmail()`. Subject: "Warm regards from Smelt". Brand intro + what to expect; CTA `label:"Shop the hats"`, `url: absoluteUrl("/product")`. Test asserts subject matches `/warm regards/i` and html contains the product url. Commit `feat(email): newsletter welcome template`.

---

## Phase 4 — Wire emails into the orchestrator

### Task 16: Rebuild `lib/email.ts` on the shared layout

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Replace inline HTML with template modules + add senders**

Keep `isEmailConfigured`, `fromAddress`, `resend`, and the `notifyTo` list logic (already comma-split). Replace the body-building in `sendOrderEmails` to call `orderConfirmationEmail` and `ownerAlertEmail`, and add new exported async functions. Full new senders:

```ts
import { orderConfirmationEmail } from "./emails/orderConfirmation";
import { ownerAlertEmail } from "./emails/ownerAlert";
import { paymentFailedEmail } from "./emails/paymentFailed";
import { abandonedCartEmail } from "./emails/abandonedCart";
import { shippingEmail } from "./emails/shipping";
import { deliveredEmail } from "./emails/delivered";
import { welcomeEmail } from "./emails/welcome";
import { absoluteUrl } from "./emails/theme";
import type { ShippingAddress } from "./address";

// helper used by all senders
async function send(to: string | string[], subject: string, html: string, text: string) {
  if (!isEmailConfigured()) return;
  try {
    await resend().emails.send({ from: fromAddress(), to, subject, html, text });
  } catch (err) {
    console.error(`Email failed (${subject}):`, err);
  }
}
```

Extend `OrderEmailData` with `customerName?: string | null; shippingAddress?: ShippingAddress | null;`. Rewrite `sendOrderEmails` to build both emails via the templates and send them (customer receipt when `data.email`, owner alert when `notifyTo.length`), preserving `Promise.allSettled` best-effort behavior. Add:

```ts
export async function sendPaymentFailedEmail(d: { email: string; items: OrderItem[] }) {
  if (!d.email) return;
  const e = paymentFailedEmail({ items: d.items, retryUrl: absoluteUrl("/checkout") });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendAbandonedCartEmail(d: { email: string; name?: string | null; items: OrderItem[]; total: string }) {
  const e = abandonedCartEmail({ name: d.name, items: d.items, total: d.total, cartUrl: absoluteUrl("/cart") });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendShippingEmail(d: { email: string; name?: string | null; carrier: string; trackingNumber: string; trackingUrl?: string; items: OrderItem[] }) {
  const e = shippingEmail(d);
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendDeliveredEmail(d: { email: string; name?: string | null }) {
  const e = deliveredEmail({ name: d.name });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendWelcomeEmail(email: string) {
  const e = welcomeEmail();
  await send(email, e.subject, e.html, e.text);
}
```

- [ ] **Step 2: Type-check + existing tests**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat(email): orchestrate all templates; add send* functions"
```

---

## Phase 5 — Checkout: address capture + cart tracking

### Task 17: Cart-track API route

**Files:**
- Create: `app/api/cart/track/route.ts`

- [ ] **Step 1: Read the Next docs**

Read `node_modules/next/dist/docs/` route-handler guidance to confirm the route signature for this Next version.

- [ ] **Step 2: Implement**

```ts
// app/api/cart/track/route.ts
import { sanitizeCart } from "@/lib/checkoutShared"; // see note
import { cartSubtotal } from "@/lib/cartReducer";
import { PRODUCT } from "@/lib/product";
import { trackCart } from "@/lib/carts";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; name?: unknown; cart?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) return Response.json({ ok: false }, { status: 400 });
  const cart = sanitizeCart(body.cart);
  const amount = cartSubtotal(cart);
  if (amount <= 0) return Response.json({ ok: true }); // nothing to track
  const items = (Object.keys(cart) as Array<keyof typeof cart>)
    .filter((c) => cart[c] > 0)
    .map((c) => ({ colour: c as string, name: PRODUCT.variants[c].name, qty: cart[c] }));
  try {
    await trackCart({ email, name: typeof body.name === "string" ? body.name.trim() : null, items, amountRand: amount });
  } catch (err) { console.error("cart track failed:", err); }
  return Response.json({ ok: true });
}
```

Note: `sanitizeCart` currently lives inline in `app/api/checkout/route.ts`. Extract it into a new shared module `lib/checkoutShared.ts` (export `sanitizeCart`) and import it in both the checkout route and here, to stay DRY.

- [ ] **Step 3: Extract `sanitizeCart`**

Create `lib/checkoutShared.ts` with the `sanitizeCart` function moved verbatim from `app/api/checkout/route.ts`, and update that route to import it.

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/cart/track/route.ts lib/checkoutShared.ts app/api/checkout/route.ts
git commit -m "feat(checkout): cart-track endpoint + shared sanitizeCart"
```

### Task 18: Checkout form — name & address fields + track-on-blur

**Files:**
- Modify: `app/checkout/page.tsx`, `app/checkout/checkout.module.css`

- [ ] **Step 1: Add state + fields**

Add `useState` for `name` and each address field (line1, line2, city, postalCode, province, country default "South Africa", phone). Render inputs styled like the existing `styles.input`/`styles.field`. Include them in the `/api/checkout` POST body as `name` and `address`.

- [ ] **Step 2: Track on email blur**

Add an `onBlur` on the email input that, when the email matches `EMAIL_RE` and the cart is non-empty, fires `fetch("/api/cart/track", { method:"POST", headers, body: JSON.stringify({ email, name, cart }) })` (fire-and-forget; ignore errors).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Load `/checkout` with a hat in the cart, enter an email, blur, fill address. Confirm no console errors and (with `DATABASE_URL` set) a row appears in `abandoned_carts`.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/page.tsx app/checkout/checkout.module.css
git commit -m "feat(checkout): collect name + shipping address; track cart on blur"
```

### Task 19: Thread address through checkout + payment + conversion

**Files:**
- Modify: `app/api/checkout/route.ts`, `app/api/paystack/webhook/route.ts`, `app/api/checkout/verify/route.ts`

- [ ] **Step 1: `/api/checkout` — validate + forward address**

Parse `body.name`/`body.address`, run `sanitizeAddress`, and include `customerName` + `shippingAddress` inside the Paystack `metadata` object (alongside `items`, `amountRand`).

- [ ] **Step 2: Webhook & verify — persist address, mark converted, pass to email**

In both `app/api/paystack/webhook/route.ts` and `app/api/checkout/verify/route.ts`: read `customerName`/`shippingAddress` from `metadata`, pass them into `recordOrder`, pass them into `sendOrderEmails`, and after a successful `newlyPaid` write call `markCartConverted(email)` (import from `@/lib/carts`). Widen the metadata type in the webhook's `event.data` to include the new fields.

- [ ] **Step 3: Handle `charge.failed` in webhook**

Add after the `charge.success` block:

```ts
  if (event.event === "charge.failed" && event.data) {
    const d = event.data;
    await sendPaymentFailedEmail({
      email: d.customer?.email ?? "",
      items: d.metadata?.items ?? [],
    });
  }
```

Import `sendPaymentFailedEmail` from `@/lib/email`.

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add app/api/checkout/route.ts app/api/paystack/webhook/route.ts app/api/checkout/verify/route.ts
git commit -m "feat(checkout): persist address, mark cart converted, handle failed charges"
```

---

## Phase 6 — Cron, newsletter, admin

### Task 20: Abandoned-cart cron route

**Files:**
- Create: `app/api/cron/abandoned-carts/route.ts`, `vercel.json`

- [ ] **Step 1: Implement route**

```ts
// app/api/cron/abandoned-carts/route.ts
import { findAbandonedCarts, stampReminded } from "@/lib/carts";
import { sendAbandonedCartEmail } from "@/lib/email";
import { formatMoney } from "@/lib/pricing";

export const runtime = "nodejs";
const FOUR_HOURS_MIN = 240;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const carts = await findAbandonedCarts(FOUR_HOURS_MIN);
  let sent = 0;
  for (const c of carts) {
    await sendAbandonedCartEmail({
      email: c.email, name: c.name, items: c.items, total: formatMoney(c.amountRand),
    });
    await stampReminded(c.email);
    sent++;
  }
  return Response.json({ ok: true, sent });
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/abandoned-carts", "schedule": "0 * * * *" }
  ]
}
```

Note: Vercel Cron sends its own `Authorization: Bearer $CRON_SECRET` header automatically when `CRON_SECRET` is set in project env — the check above satisfies both Vercel's caller and manual `curl` testing.

- [ ] **Step 3: Manual verification**

With `DATABASE_URL`, `RESEND_API_KEY`, `CRON_SECRET` set and an aged/edited `abandoned_carts` row (temporarily lower `FOUR_HOURS_MIN` to `0` locally):
Run: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/abandoned-carts`
Expected: `{"ok":true,"sent":1}`, email received, `reminded_at` stamped; a second call returns `sent:0`. Restore `FOUR_HOURS_MIN` to `240`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/abandoned-carts/route.ts vercel.json
git commit -m "feat(cron): abandoned-cart reminder via Vercel Cron"
```

### Task 21: Newsletter route + footer wiring

**Files:**
- Create: `app/api/newsletter/route.ts`
- Modify: `components/Footer.tsx`

- [ ] **Step 1: Implement route**

```ts
// app/api/newsletter/route.ts
import { addSubscriber } from "@/lib/subscribers";
import { sendWelcomeEmail } from "@/lib/email";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  try {
    const isNew = await addSubscriber(email);
    if (isNew) await sendWelcomeEmail(email);
  } catch (err) { console.error("newsletter signup failed:", err); }
  return Response.json({ ok: true }); // don't leak whether email already existed
}
```

- [ ] **Step 2: Wire the footer form**

In `components/Footer.tsx`, make the signup a client component (add `"use client"` if not already; check the file). Replace the `onSubmit={(e) => e.preventDefault()}` no-op with a handler that reads the input value, POSTs to `/api/newsletter`, and shows a simple "Thanks — warm regards" success state or an inline error. Keep existing `styles` classes.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, submit the footer form. Expected: success message; with DB+Resend set, a `subscribers` row + welcome email; resubmitting the same email does not re-send (no new welcome).

- [ ] **Step 4: Commit**

```bash
git add app/api/newsletter/route.ts components/Footer.tsx
git commit -m "feat(newsletter): subscribe endpoint + footer wiring + welcome email"
```

### Task 22: Admin auth helper (simple)

**Files:**
- Create: `lib/adminAuth.ts`

- [ ] **Step 1: Implement a minimal shared-password guard**

Per the approved decision, keep this simple: the admin page and its API routes accept the password via an `x-admin-password` header (page sends it from a prompt kept in `sessionStorage`), compared server-side against `ADMIN_PASSWORD`. No cookie/session flow.

```ts
// lib/adminAuth.ts
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** True when the request carries the correct admin password. */
export function isAdminRequest(request: Request): boolean {
  const supplied = request.headers.get("x-admin-password") ?? "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return Boolean(expected) && supplied === expected;
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add lib/adminAuth.ts
git commit -m "feat(admin): simple shared-password guard"
```

### Task 23: Admin API routes (ship / deliver / list)

**Files:**
- Create: `app/api/admin/orders/route.ts` (GET list), `app/api/admin/orders/ship/route.ts`, `app/api/admin/orders/deliver/route.ts`

- [ ] **Step 1: List route**

```ts
// app/api/admin/orders/route.ts
import { isAdminRequest } from "@/lib/adminAuth";
import { listOrders } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return new Response("unauthorized", { status: 401 });
  return Response.json({ orders: await listOrders() });
}
```

- [ ] **Step 2: Ship route**

```ts
// app/api/admin/orders/ship/route.ts
import { isAdminRequest } from "@/lib/adminAuth";
import { markShipped } from "@/lib/orders";
import { sendShippingEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return new Response("unauthorized", { status: 401 });
  const b = await request.json();
  const order = await markShipped(String(b.reference), {
    carrier: String(b.carrier ?? ""), trackingNumber: String(b.trackingNumber ?? ""),
    trackingUrl: b.trackingUrl ? String(b.trackingUrl) : undefined,
  });
  if (!order) return Response.json({ ok: false, error: "Order not found." }, { status: 404 });
  await sendShippingEmail({
    email: order.email, name: order.customerName, carrier: order.trackingCarrier ?? "",
    trackingNumber: order.trackingNumber ?? "", trackingUrl: order.trackingUrl ?? undefined,
    items: order.items,
  });
  return Response.json({ ok: true, order });
}
```

- [ ] **Step 3: Deliver route**

Analogous: guard, `markDelivered(reference)`, then `sendDeliveredEmail({ email: order.email, name: order.customerName })`. Return `{ ok, order }` / 404.

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add app/api/admin/orders
git commit -m "feat(admin): list/ship/deliver API routes with email triggers"
```

### Task 24: Admin page UI

**Files:**
- Create: `app/admin/page.tsx`, `app/admin/admin.module.css`

- [ ] **Step 1: Implement client page**

`"use client"` page that: on mount reads a password from `sessionStorage` (prompting via a small form if absent), fetches `GET /api/admin/orders` with the `x-admin-password` header, and renders a table of orders (reference, email, name, status, fulfillment_status, items). Each not-yet-shipped order shows inputs for carrier + tracking number + optional URL and a "Mark shipped" button (POST `/api/admin/orders/ship`). Shipped-but-not-delivered orders show a "Mark delivered" button (POST `/api/admin/orders/deliver`). On 401, clear the stored password and re-prompt. Style with `admin.module.css` echoing the site (paper bg, ink text, pill buttons).

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, set `ADMIN_PASSWORD`. Visit `/admin`, enter the password, confirm orders list. Mark a test order shipped with a tracking number → shipping email arrives; mark delivered → delivered email arrives. Wrong password → 401 + re-prompt.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx app/admin/admin.module.css
git commit -m "feat(admin): orders dashboard with ship/deliver actions"
```

---

## Phase 7 — Config, docs, final verification

### Task 25: Env template + docs

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Document new env vars**

Append to `.env.local.example`:

```
# Absolute site URL for links/images inside emails (no trailing slash).
# Required for correct email links from cron/admin (which have no request origin).
SITE_URL=https://saunahat.co.za

# Secret the abandoned-cart cron route checks (Vercel sends it automatically).
CRON_SECRET=

# Single shared password gating the /admin dashboard.
ADMIN_PASSWORD=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs(env): document SITE_URL, CRON_SECRET, ADMIN_PASSWORD"
```

### Task 26: Full build + test gate

- [ ] **Step 1: Run the whole suite**

Run: `npm run test`
Expected: all tests pass (pricing, cartReducer, and all `lib/emails/*` + address tests).

- [ ] **Step 2: Lint + type-check + production build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: no lint errors, no type errors, successful Next build.

- [ ] **Step 3: Email render smoke check (optional but recommended)**

Write a throwaway `scripts/preview-emails.ts` (run with `npx tsx`) that imports each `*Email()` and writes `.html` files to a temp dir; open them in a browser to eyeball rendering on Gmail/Apple Mail. Delete the script before final commit, or keep under `scripts/` if useful.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A && git commit -m "chore: transactional email suite build/test pass"
```

---

## Manual end-to-end verification (post-implementation)

1. **Confirmation + owner alert:** Paystack test payment through `/checkout` (with address) → both emails arrive, render on Gmail + Apple Mail, address correct.
2. **Payment failed:** trigger a failed test charge → customer gets the retry email.
3. **Abandoned cart:** enter email at checkout, don't pay; run cron (lowered threshold) → reminder arrives; then complete payment with same email → `converted_at` set, no second reminder.
4. **Shipping + delivered:** `/admin` → mark shipped (tracking) → email with working track link; mark delivered → follow-up email.
5. **Welcome:** footer signup → welcome email; resubmit → no duplicate.
6. **Degradation:** unset `RESEND_API_KEY` → all sends silent; unset `DATABASE_URL` → cart/subscriber/admin features no-op without 500s.

## Deployment notes

- Set in Vercel project env (Production): `RESEND_API_KEY`, `ORDER_FROM_EMAIL`, `ORDER_NOTIFY_EMAIL`, `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, `SITE_URL`, `CRON_SECRET`, `ADMIN_PASSWORD`.
- Add `charge.failed` (in addition to `charge.success`) to the Paystack webhook events if the dashboard filters by event type.
- Vercel Cron requires the `vercel.json` `crons` entry and a deployed Production build.
```
