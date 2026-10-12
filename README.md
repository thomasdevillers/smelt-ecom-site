# Smelt

Mobile-first e-commerce site for Smelt sauna hats. Next.js (App Router) + TypeScript.

## Develop
    npm install
    npm run dev        # http://localhost:3000

> Note: if port 3000 is already in use, start on another port with `PORT=3100 npm run dev`.

## Test & build
    npm test           # pricing + cart unit tests (Vitest)
    npm run build      # production build

## Edit content
- Prices / bundle tiers / free-ship threshold: `lib/pricing.ts`
- Product data & images: `lib/product.ts`
- Founder story (has [FILL IN] markers): `content/about.ts`
- Colours / fonts / radii: `styles/tokens.css`

## Structure
- `app/` — routes: `/` (home), `/product`, `/about`, `/cart`, `/checkout`
- `components/` — UI sections (Hero, Bundles, Reels, CartDrawer, …) + `ui/` primitives
- `lib/` — `pricing.ts`, `product.ts`, `cartReducer.ts`, `cart.tsx` (context)
- `public/images/` — product shots, founder photos, logos

## Orders

Paystack is the source of truth for paid orders. Customer details, delivery
address, cart contents, and quantities are attached to each Paystack transaction
as metadata and custom fields. Stock and fulfilment are tracked manually; the
site does not require a database.

## Deploy (Vercel)
1. Push this repo to GitHub.
2. Import it at vercel.com → framework auto-detected as Next.js.
3. Configure the Paystack environment variables from `.env.local.example`.
4. Deploy.

## v1 notes
- Checkout takes real payments through Paystack.
- Cart persists to localStorage (`smelt-cart-v1`).
- Bundle discounts are computed **per colour** (5% off at qty 2, 10% off at qty 3).
