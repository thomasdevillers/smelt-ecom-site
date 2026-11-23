# Product research

The standalone questionnaire is at `/help-shape-smelt`. No invitation links or pop-ups have been added elsewhere. The page is marked noindex while placements are being decided.

## Questions

`lib/research/shared.ts` is the versioned question definition and server validation. The first three questions cover frequency, current kit and product interest. Each selected product adds two unique, optional follow-ups. A final comment is optional. “Nothing right now” is exclusive. Deselecting a product hides its follow-ups but preserves earlier answers, labelled “no longer selected” in admin.

## Storage and autosave

**Database ready — 23 November 2026:** the owner approved schema application and confirmed the production Neon destination. Migrations `0002`–`0005` are applied (six total, zero pending), existing business records matched their preflight checksums, and real Neon partial/completed saves, revision guards, admin reads and rate limits passed inside a rolled-back transaction. No synthetic responses remain. Order/payment import and cutover were not performed. The questionnaire still needs application deployment before public use.

- Uses the existing `NEON_CONNECTION_STRING` and `postgresStore()` directly. There is no Redis fallback for answers or rate limits. The existing admin sign-in system is unchanged.
- Migration `0005_product_research.sql` creates two independent tables: `research_responses` and `research_rate_limits`. Apply through the existing migration workflow **after reviewing any earlier pending migrations**: `npm run db:migrate`, then `npm run db:migrate -- --apply` when approved. Do not apply unrelated pending migrations without review.
- Development responses and production responses have separate namespaces. Existing database guards deliberately block Neon access on Vercel preview deployments.
- The browser creates a random anonymous 256-bit token, kept in local storage with the latest draft. Only its SHA-256 digest identifies the server response. Tokens never appear in URLs or admin results.
- Tapped answers save immediately; written answers debounce for 500ms and flush on blur/navigation. Saves are serialized; increasing revisions prevent late or duplicated requests from overwriting newer answers. A best-effort keepalive request sends the latest draft when the page becomes hidden.
- Failures show an error and retry automatically with backoff, when the browser comes online, or via Retry save. Local drafts resume on the same browser. “Saved” and the completed thank-you screen require server acknowledgement. Closing a browser while offline cannot guarantee a server save; the draft is retained locally where storage is available.
- No empty response is created just by viewing the page. Completion requires the three base questions, not the optional follow-ups.
- Same-origin checks, bounded body size, strict answer validation, and Postgres-backed hourly counters protect the public endpoint. Rate counters use daily-salted IP hashes, never raw IP addresses; expired counters are pruned during subsequent saves.

## Admin

Open `/admin` → **Product research**. The panel shows total, partial and completed responses, current product-interest counts across all responses, and paginated individual answers with start/last-save timestamps. Click Refresh responses to fetch current data. Partial indicates no finish acknowledgement, not a proven abandonment. No names, emails or customer/order linkage are collected.

## Checks

For local LAN testing, the browsing hostname must be included in `allowedDevOrigins` in `next.config.ts`. The previous `192.168.0.11` and current `192.168.0.13` are allowed. Next.js 16 blocks unapproved dev origins, which can prevent client initialization and leave the questionnaire on “Getting your questions ready…”. If your LAN IP changes, add the new hostname and restart the dev server if it does not reload configuration automatically. `localhost` is already allowed by Next.js.

`npx vitest run lib/research app/api/research/route.test.ts app/api/admin/research/route.test.ts`

Repository tests use isolated WASM PostgreSQL, not Neon, and cover first-answer persistence, updates, stale writes, completion, namespaces, pagination and rate limits.
