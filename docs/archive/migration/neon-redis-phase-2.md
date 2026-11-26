# Phase 2 — simple Neon foundation

**Current status — 23 November 2026:** six migrations (`0000`–`0005`) are applied. The initial 291-entity copy was finally reconciled to **293 matching entities**, and review/custom-design reads/writes are live on Neon. The separately approved 23 November schema-only application added order/payment and product-research tables without importing orders or switching their runtime authority; see [Phase 5 schema application](neon-redis-phase-5.md#schema-only-application--23-november-2026). Other existing business domains remain on Redis. The zero-row observations below describe the original setup before import; see [import history](neon-redis-phase-3.md#owner-approved-neon-bulk-import--20-november-2026) and [completed cutover/rollback log](neon-redis-cutover.md).

## Current setup

Simplified at the user's request on **20 November 2026**:

- One Neon project, database and existing login.
- One secret: `NEON_CONNECTION_STRING` in `.env.local` (or `.env`). No extra role, staging project or host-allowlist variables.
- Drizzle typed queries and versioned SQL migrations. Runtime connections use the supplied endpoint; migrations automatically use its direct Neon endpoint with the same login.
- Server-only, lazy database client; certificate-verified TLS and connection/query timeouts.
- Hosted Vercel previews/development cannot use this connection. Local SQL tests use disposable in-memory PostgreSQL, not Neon or customer data.

Using the default owner login means the application can change the schema. This is the accepted simplicity trade-off, not least-privilege isolation. Never expose this secret to the browser or previews.

## What has actually been done

- Confirmed the supplied Neon connection works and the database was empty before setup.
- Applied `drizzle/0000_review_custom_foundation.sql`: **12 empty foundation tables** for reviews/custom hats and their customer/order relationships.
- Verified all 12 tables exist and contain **zero business rows**.
- Tested an interactive transaction and duplicate-key rejection against Neon using synthetic rows; the transaction was rolled back and no test rows remain.
- Verified migration reruns have no pending changes (see validation below).

The live app still reads/writes Redis. No customer records imported; no emails, payments, rewards, provider files or storage configuration changed.

## Kept small on purpose

`lib/db/schema.ts` contains:

- `environments`, `customers`, `orders`, `order_items`;
- `reviews`, `review_invitations`, `review_claims`, `review_uploads`, `review_rankings`;
- `custom_requests`, `custom_revisions`, `custom_files`.

The `environments` column/table preserves existing **source live/test ownership inside this one database**. It does not require extra Neon projects, credentials or deployment environments. Importers must preserve explicit ownership and quarantine ambiguous sources rather than guess.

IDs, references, historical details, timestamps, consent and existing file references are preserved. Money uses integer minor units with currency; foreign keys and unique/check constraints enforce relationships and one review per order. Token digests and optional encrypted active-token material remain available. Absolute expiry columns do not automatically extend links or delete records/files.

`lib/db/repositories.ts` provides initial review/custom-hat queries. They are internal building blocks, not replacements for route authorization or complete domain workflows. `adminStore()` and existing business entry points are unchanged; `lib/db/redis.ts` keeps Redis separate.

The speculative later-domain schema, permission-audit scripts, grant generation and encrypted staging layer have been removed from the active code/migration path. Their unapplied drafts are retained locally under ignored `.local/migration/phase-2-drafts/` as non-executable notes. The empty remote database and absence of migration history were verified before replacing the original unapplied drafts. **The new migration is now applied: do not rewrite it.** Add future migrations instead.

## Commands

```sh
npm run db:test                 # synthetic, local-only SQL tests
npm run db:generate             # generate SQL after deliberate schema changes
npm run db:migrate              # read-only history/pending check
npm run db:migrate -- --apply   # explicitly apply versioned schema changes
```

Migration commands load `.env` then `.env.local`; existing shell variables take precedence. They do not import records or activate the PostgreSQL adapters. They reject changed migration history and refuse initial setup on a nonempty, unrecognised database. A direct-connection advisory lock serializes schema application.

## Next step

The **review/custom-hat bulk import is completed and verified**: [Phase 3 outcome and remaining gates](neon-redis-phase-3.md). Its checkpoint schema is applied. The owner approved keeping only the published member of the three-review conflict; the imported plan excludes the two rejected duplicates and has zero quarantines. Preserve Blob URLs/R2 keys and reconcile final changes/in-flight ownership before a later domain cutover. Add order/automation/inventory schemas only when those domains are next.

The user confirmed Neon's recovery window is set to **7 days**, then deferred restore troubleshooting and explicitly accepted unverified recovery for the bulk import and, separately, the completed production cutover. The outstanding Phase 1 provider billing/recovery exports remain recorded there. No file migration, automatic source-key cleanup or recovery-settings change was authorised or performed.

## Validation — 20 November 2026

- 17 local database tests pass: configuration/preview blocking, TLS/direct endpoint selection, authenticated secret envelopes, migration reruns, cross-namespace isolation, money/status/unique/FK checks, invitation replacement, ownership and transaction rollback.
- Full `npm test`: **729 passed, 32 skipped** (78 files passed, 3 skipped). The count is lower than the earlier draft because its deferred-domain/role/staging tests were archived with that unapplied code, not because active tests were disabled.
- `npm run db:migrate`: **0 pending**; `npm run db:generate`: no schema changes.
- ESLint passes for the database files, migration CLI and Drizzle config.
- Real Neon: connection, table existence, duplicate constraint and transaction rollback verified; zero business rows remain.
- Whole-project TypeScript remains blocked by existing duplicate generated `.next/types` declarations; no new database-file type errors were reported. Those generated files were not removed.

Manual setup is now short: [Neon setup](neon-redis-manual-setup.md).
