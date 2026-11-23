# Redis to Neon PostgreSQL migration plan

## Target architecture

Move durable business records from Redis into Neon PostgreSQL, and retain Redis for temporary operational state. Keep Vercel hosting, Paystack payments and Resend email delivery.

Uploaded-file migration is out of scope and deferred to a later stage. Review photos remain in Vercel Blob and custom-hat artwork remains in Cloudflare R2. Migrate their existing metadata and ownership records without changing file locations, URLs, upload mechanisms or storage-provider credentials.

This is a phased migration, not a single database swap. This document is a proposal; it does not authorise production changes.

## 1. Data ownership

| Data | Destination |
|---|---|
| Customers, local order records, line items and payment status snapshots | Neon PostgreSQL |
| Completion dates, review-message dates, shipments and shipping history | Neon PostgreSQL |
| Reviews, invitations, submission claims, consent and ranking results | Neon PostgreSQL |
| Custom-hat requests, design submissions, revisions and file ownership | Neon PostgreSQL |
| Stock, preorder batches, allocations and checkout reservations | Neon PostgreSQL |
| Coupons, vouchers, reservations, redemptions and reward records | Neon PostgreSQL |
| Email receipts, retry state, campaign history and audit resolutions | Neon PostgreSQL |
| Checkout follow-ups, recovery links, marketing consent and suppressions | Neon PostgreSQL, retaining existing expiry policies |
| Restock requests and notification history | Neon PostgreSQL |
| Saved hat conversations and turns | Neon PostgreSQL, with explicit retention |
| Review photo metadata, existing URLs and custom-hat file keys/ownership | Neon PostgreSQL |
| Review photo files | Vercel Blob, unchanged |
| Custom-hat artwork files | Cloudflare R2, unchanged |
| Admin sessions, rate limits and short-lived counters | Redis |
| Disposable caches and advisory job locks | Redis |

Redis must not be the only record preventing duplicate financial actions or emails. Those guarantees belong in PostgreSQL constraints and durable workflow state, even when Redis helps coordinate workers.

Static product images, felt swatches and editorial content can stay in the repository. Paystack remains authoritative for payments. Historical Vercel analytics remains with Vercel unless separately exported.

## 2. Phase 1 — Inventory and recovery baseline

Before changing production:

- Inventory Redis namespaces, types, counts and TTLs using incremental scans.
- Identify legacy, live/test and unnamespaced records; do not infer environment where it is ambiguous.
- Inventory file references and ownership metadata stored in Redis; preserve their existing Vercel Blob URLs and R2 keys. Do not copy or reorganise files.
- Audit private local shipping receipts and campaign logs for records not already in shared storage.
- Record existing provider IDs, idempotency keys, pending sends, voucher balances and stock allocations.
- Capture encrypted backups and test that they can be restored.
- Measure current dashboard performance, storage usage and service costs.

**Deliverable:** a source-to-destination mapping covering every discovered Redis dataset, with explicit decisions for obsolete and expired records. Unknown records are quarantined, not silently dropped.

Phase 1 implementation, source register, private-artifact handling and remaining gates: [Inventory and recovery baseline](neon-redis-phase-1.md).

## 3. Phase 2 — Establish Neon and the data-access foundation

### Infrastructure

- Choose a Neon PostgreSQL region close to the Vercel execution region. Reconfirm availability and pricing before provisioning; Object Storage availability is not a requirement for this migration.
- Configure a paid production project, recovery history, monitoring and billing alerts.
- **Simplified setup approved 20 November 2026:** use one Neon project/database and the existing login, configured through `NEON_CONNECTION_STRING`. Use disposable local PostgreSQL for synthetic tests; no additional Neon development/staging projects are required.
- Keep production customer data out of ordinary preview branches; use synthetic or sanitised fixtures. Ensure previews cannot use copied file references or production storage credentials to access or delete customer files.
- Use the same login for runtime/schema setup for now, accepting its broader schema-owner permissions. Keep the connection secret out of browsers and previews; introducing restricted roles later remains optional.
- Retain existing Vercel Blob and R2 configuration, bucket access controls and CORS settings. Do not provision Neon Object Storage for this migration.

### Application structure

Introduce separate PostgreSQL and Redis data-access adapters, leaving existing file-storage integrations in place. Do not replace `adminStore()` wholesale: it currently mixes business records with sessions and rate limits.

Use versioned SQL migrations and typed queries. Drizzle with PostgreSQL is a proposed implementation choice, with a connection setup supporting the transactions these workflows require.

Before implementation, read the installed Next.js guides required by `AGENTS.md`.

### Core schema rules

- Preserve existing review IDs, order references, file keys and timestamps.
- Store money as integer minor units, with currency.
- Use foreign keys, explicit status checks and unique constraints.
- Preserve historical prices and order details rather than recalculating them from current product settings.
- Keep flexible design submissions/provider payloads in JSONB where appropriate.
- Store token digests where possible; securely retain any existing token material still required for active workflows.
- Add explicit expiry timestamps and cleanup jobs instead of relying on Redis TTLs.
- Preserve live/test separation through explicit environment ownership and constraints.

**Deliverable (simplified scope):** tested initial review/custom-hat schema and data-access foundation, with no production behaviour change. Build repeatable domain import tooling in Phase 3 and add later-domain schemas as needed rather than provisioning the whole migration upfront.

Phase 2 implementation scope, local runbook and remaining infrastructure/schema gates: [PostgreSQL data-access foundation](neon-redis-phase-2.md).

## 4. Phase 3 — Build safe import and cutover tooling

Review/custom-hat importer, offline capture comparison and read-only verification: [Phase 3 tooling](neon-redis-phase-3.md). The 291-entity bulk copy was reconciled to **293 matching entities under a domain pause**, then the separately approved production cutover completed on 21 November. Review/custom-design reads/writes now use Neon; see [cutover and rollback evidence](neon-redis-cutover.md). Recovery remains unverified with risk explicitly accepted; other domains are not switched by this slice.

Every importer must be:

- **Idempotent:** rerunning cannot duplicate or overwrite newer records.
- **Resumable:** checkpoints and per-record outcomes.
- **Side-effect-free:** imports never send emails, issue rewards or alter payments.
- **Auditable:** count comparisons, checksums, rejected-record reports and source identifiers.

Use existing business IDs wherever possible. Reconstruct relationships carefully: some historical shipping receipts belong to an email/waybill pair, not a known order.

### Cutover strategy

Use one authoritative writer per domain, not indefinite Redis/Postgres dual-writing.

For each domain:

1. Bulk-copy while the old store remains authoritative.
2. Pause that domain's mutations and relevant jobs.
3. Reconcile final changes, including deletions and expired records.
4. Validate.
5. Switch reads and writes together.
6. Resume jobs and monitor.

Read-only shadow comparisons can run beforehand, but must never trigger external actions. Define the dependencies and shared workers affected by each domain's pause before cutover.

## 5. Phase 4 — Migrate review and custom-design records

These provide a lower-risk first production slice.

Review/custom-design paths are **live on Neon after the approved 21 November cutover**: [Phase 4 status](neon-redis-phase-4.md), [actual cutover and rollback log](neon-redis-cutover.md). Final paused reconciliation matched 293 entities; live read/privacy checks passed. Other domains remain on Redis. Recovery and full real-provider write-lifecycle acceptance remain explicitly tracked, not inferred from deployment success.

### Business records

Move reviews, invitations, claims, rankings and custom-hat submissions into PostgreSQL.

Preserve:

- One review per order.
- Existing invitation URLs and expiry times.
- Invitation replacement/revocation behaviour.
- Review moderation, anonymity, consent and incentive disclosures.
- Custom design links, revisions and file ownership.

### Preserve existing file integrations

- Migrate existing review photo metadata and URLs, custom-hat file keys, ownership sets and upload authorisation state into PostgreSQL without rewriting references.
- Update `lib/reviewStore.ts` and `lib/customHats/store.ts` to read and write business records in PostgreSQL.
- Leave `lib/customHats/storage.ts`, Vercel Blob APIs and browser upload protocols unchanged. Update routes only where they depend on migrated record lookups or authorisation.
- Preserve existing review-photo application URLs and access checks. Pending/rejected photos remain private; serving published photos still checks publication status.
- Retain normal moderation/removal behaviour against the existing storage providers. Migration imports themselves must never delete files.
- During the domain cutover, account for in-flight uploads and metadata writes so ownership records are not lost. Reconcile upload reservations and completed submissions before resuming mutations.

**Completion gate:** migrated file references and ownership records match their sources, old links work, and uploads, access checks, moderation and deletion still work with Vercel Blob and R2.

## 6. Phase 5 — Migrate order records and fulfilment

**Implementation complete; schema applied 23 November; order import and production cutover pending:** local backfill/final reconciliation tooling, SQL order/fulfilment adapters and admin queries, shared durable payment handling, and provider/refund/dispute reconciliation are implemented and tested. The owner separately approved applying schema migrations `0002`–`0005` to unblock the product-research questionnaire; existing business records were verified unchanged. The approved 22 November read-only preflight captured 327 live transactions and 164 distinct shipments. Shipping ownership decisions, the production import/cutover decision and final acceptance checks remain gates. Orders/payments still use Redis/legacy; applying schema did not switch their authority. See [Phase 5 handoff, evidence and resume runbook](neon-redis-phase-5.md).

Backfill Paystack history into local order/payment tables, then migrate completion dates, review-message dates and shipping receipts.

Add durable webhook ingestion:

- Verify webhook authenticity.
- Persist events before acknowledging them.
- Deduplicate retries and tolerate out-of-order delivery.
- Process changes idempotently.
- Reconcile periodically with Paystack for missed events and payment reversals.

Switch admin search, filters, exports and pagination to indexed SQL queries. Keep fresh Paystack verification where a sensitive action requires it.

**Completion gate:** order counts, amounts, fulfilment states and historical shipping receipts reconcile against their sources. Backfilling must not generate historical new-order emails.

## 7. Phase 6 — Migrate automation and communication history

Move:

- Customer and owner order-confirmation receipts.
- Shipping receipts and delivery status.
- Review outreach and reward-email records.
- Checkout recovery sequences and vouchers.
- Restock subscriptions and notification history.
- Thank-you campaign history.
- Suppressions, unsubscribe state, consent and audit resolutions.
- Saved conversations.

Use a transactional outbox/durable jobs table so business changes and scheduled work can commit together.

Preserve original recipients, frozen messages, provider IDs, retry counts, deadlines and idempotency keys. Ambiguous sends remain manual-review cases; migration must not restart their retry windows. A database transaction cannot atomically include an external Resend or Paystack call.

Audit all cron handlers, webhook handlers and CLI scripts, not only the web application's main data-access modules. Update configuration checks that currently assume Redis holds the migrated records.

**Completion gate:** no accepted message becomes eligible to send again, active links still work, and opt-outs remain enforced.

## 8. Phase 7 — Migrate inventory, preorders, coupons and vouchers

This is the highest-risk phase and happens last.

Replace Lua workflows with PostgreSQL transactions using:

- Conditional updates and row locking where needed.
- Unique reservation/redemption identifiers.
- Explicit reservation state transitions.
- Atomic changes across inventory and coupon reservations.
- Safe retries for deadlocks or transaction conflicts.

Test parallel checkouts, duplicate callbacks, abandoned payments, delayed successful payments, preorder allocation and coupon exhaustion.

### Production cutover

Use a short checkout-maintenance window:

1. Stop new payment initialisations and inventory/coupon mutations.
2. Pause relevant reconciliation workers.
3. Continue safely ingesting webhooks for payments already in flight.
4. Import and reconcile outstanding reservations and balances.
5. Switch the transaction-owning code.
6. Process queued events idempotently and reconcile against Paystack.
7. Reopen checkout.

Never assume closing checkout means existing payment links can no longer succeed. Webhook acknowledgement during the pause must depend on durable event persistence, not on an in-memory queue.

**Completion gate:** stock and coupon invariants hold, and repeated or delayed events cannot consume inventory twice.

## 9. Phase 8 — Validation, rollback and retirement

### Required tests

- Import reruns and interrupted imports.
- Concurrent review submissions, stock reservations and coupon use.
- Duplicate/out-of-order webhooks.
- Provider acceptance followed by failed database persistence.
- Expired tokens, revoked invitations and unsubscribe links.
- Private-file access and malicious uploads.
- Database restore procedures, including preservation of existing external-file references.
- Dashboard performance and query plans.
- Behaviour during Redis or Neon outages; financial operations must fail safely rather than bypass safeguards.

Monitor reconciliation drift, failed jobs, file errors, database connections, latency and costs.

### Rollback rules

Before new writes reach Neon, switching back is relatively simple.

After Neon accepts writes, redeploying old code is not a safe rollback. Freeze the affected domain, reconcile changes back to the old store or roll forward. Keep a tested procedure for each phase.

Retain old Redis business keys for an agreed validation period, such as 30 days, without allowing old code or jobs to mutate them. Delete migrated keys only after sign-off; retain Redis sessions, rate limits, caches and operational keys that remain in use.

Do not retire Vercel Blob or R2, remove their credentials, or delete files as migration cleanup. Their migration and recovery strategy will be handled separately. PostgreSQL recovery does not restore external files, so test how restored records behave when a file has subsequently been removed through normal moderation.

## 10. Suggested delivery order

1. Inventory, backups and schema.
2. Review and custom-design records, preserving existing file storage.
3. Order synchronisation and fulfilment.
4. Email automation, consent and remaining business records.
5. Inventory, preorders, coupons and vouchers.
6. Recovery validation and cleanup of migrated Redis business keys.

## End-state acceptance criteria

- All discovered Redis datasets have a documented destination or approved retention/deletion decision.
- Migrated durable business records are verified in Neon PostgreSQL.
- Review photos remain in Vercel Blob and custom-hat artwork remains in R2, with existing references, uploads and access controls working.
- Live/test data is separated and preview environments cannot accidentally act on production records.
- Existing customer links and file access controls continue working.
- Imports and retries cannot duplicate business actions.
- Backups, restores and post-cutover rollback procedures have been tested.
- Migrated Redis business keys are retired only after validation and explicit approval; retained Redis functionality and existing file-storage services remain operational.
- Losing Redis may temporarily affect login, rate limits or cache performance, but cannot erase orders, reviews, stock ownership, consent or communication history.

## References to verify before implementation

- Neon regions: https://neon.com/docs/introduction/regions
- Neon pricing: https://neon.com/pricing
