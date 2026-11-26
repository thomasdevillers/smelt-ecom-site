# Smelt

South African sauna-hat shop and fulfilment dashboard. Built with Next.js App Router, React, TypeScript, and CSS Modules.

## Start here

Use Node.js 22.16+ and npm.

```sh
npm ci
cp .env.local.example .env.local
npm run dev
```

The storefront opens at http://localhost:3000; the back office is `/admin`. Use separate development services and Paystack test credentials. Product reviews are labelled fixtures in development. Checkout and other integrations need the services described in [development](docs/development.md).

## Common edits

| Change | Location |
| --- | --- |
| Prices, bundle rules, delivery charges | `lib/pricing.ts` |
| Product names, colours, images | `lib/product.ts` |
| Stock/preorder display mode | `lib/salesMode.ts` — see [operations](docs/operations.md) |
| Story, policies, care, articles | `content/` |
| Merchant-supplied review export data | `content/manual-reviews.json` |
| Colours, fonts, spacing tokens | `styles/tokens.css` |
| Public pages | `app/(shop)/(public)/` |
| Private customer links | `app/(shop)/(private)/` |
| Admin interface | `app/admin/` |
| Scheduled jobs | `vercel.json` and `app/api/cron/` |

Parentheses in route folders organize layouts; they do not appear in URLs.

## Checks

```sh
npm run check         # lint, generated route types, TypeScript, unit/database tests
npm run format:check
npm run build         # ordinary production build
npm run build:test    # production build with local provider credentials disabled
npx playwright install chromium
npm run test:e2e      # isolated browser tests against that test build
```

Browser tests mock API/provider boundaries; they never make real payments or send email. CI runs these checks on pull requests. Redis/recovery integration tests use explicit, disposable test infrastructure; see [development](docs/development.md).

## Understand the project

- [Architecture](docs/architecture.md): request flow, folder responsibilities, service ownership.
- [Development](docs/development.md): configuration, testing, formatting, local files.
- [Operations](docs/operations.md): deployment, scheduled jobs, shipping and storefront changes.
- [Migration status](docs/migration-status.md): current recorded stores and outstanding production work.
- [Google review feed](docs/google-product-reviews.md) and [product research](docs/product-research.md): feature instructions.
- [Historical archive](docs/archive/README.md): past designs, migration decisions and evidence.

The application uses PostgreSQL **and** Redis. Paystack handles payments; Resend sends mail; Blob and R2 store customer files. See the migration status before changing storage switches.
