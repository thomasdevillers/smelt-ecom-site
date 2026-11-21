# Phase 4 — review/custom-design application paths

Status: **review/custom-design reads and writes are live on Neon as of 21 November 2026**. Both schema migrations are applied. The initial 291-entity copy was reconciled to **293 matching entities** under a production domain pause, then the SQL-backed app was deployed and resumed. Existing Blob/R2 locations are unchanged. See the [actual cutover, commits, smoke results and rollback rules](neon-redis-cutover.md). Recovery remains unverified/accepted; full real-provider write-lifecycle smoke checks remain follow-up work.

**21 November:** the owner approved proceeding despite unverified recovery and requested clean commits first. Three scoped commits plus the annotated pre-cutover tag were created and pushed before resume. Final pause, drift reconciliation, SQL verification and live read/privacy/link checks were performed; none of the provider files were migrated or deleted.

## Small configuration surface

```dotenv
REVIEW_CUSTOM_STORE=redis
REVIEW_CUSTOM_PAUSED=false
```

- `REVIEW_CUSTOM_STORE=postgres` switches **both reads and writes** for reviews and custom designs, including saved rankings, ranking retry state and the manual ranking CLI. No dual-writing or automatic Redis fallback occurs. Invalid store values fail closed.
- The existing `NEON_CONNECTION_STRING` is the only database secret. No new projects, roles, buckets or encryption keys. Runtime PostgreSQL access is lazy and server-only; hosted Vercel previews/development are rejected before reading SQL or cached SQL review results.
- `REVIEW_CUSTOM_PAUSED=true` rejects review/custom-design mutations, upload reservations, outreach/reward workers, ranking jobs and temporary-state cleanup before they start work. Reads remain available. Invalid nonempty pause values block mutations too.
- These settings are **deployment/process scoped**, not a distributed lock. Drain old deployments, requests, running jobs, manually launched scripts and authorised uploads before the final capture. Deploying a pause does not cancel work already running or revoke already-issued provider URLs. Include custom-submission notification sends in that drain.

The actual Production/operator settings are now `postgres` / `false`; the example above remains the safe default for an unconfigured deployment. Do not copy production credentials to previews. Merely setting a connection string does not activate PostgreSQL.

## Implemented behaviour

### Reviews

`lib/reviewStore.ts` delegates to `lib/db/review-domain.ts` when selected:

- SQL review/invitation/claim/upload/ranking records retain existing IDs, JSON payloads, consent, anonymity, incentive disclosures, timestamps and exact Blob references.
- Invitation replacement, upload quotas and submission lock the same environment/order row. Submission commits the review, its claim and invitation usage together. Database uniqueness still enforces one review per order. Older reviews without claim rows still prevent another submission.
- Replaced/revoked and expired invitations cannot authorise uploads or submissions. Effective SQL deadlines are enforced without extending source TTLs. A used link reports used while it remains valid, but cannot submit again.
- Existing validation and fresh Paystack verification remain in the store. Blob photo verification and upload protocols are unchanged. Importers do not perform those provider actions.
- Public photo serving still checks the review's publication state; pending/rejected photos require the existing admin access checks. Public DTOs do not expose customer emails or tokens. Public review caches are separated by namespace **and backend**, so a deployment cannot reuse a cached Redis result after selecting SQL.
- Edits/moderation/photo removal lock the review row to avoid losing concurrent changes. Rejection commits the private status before attempting Blob deletion; failed deletion retains photo metadata for retry. Successful removal also clears associated SQL photo metadata.

### Custom designs

`lib/customHats/store.ts` delegates to `lib/db/custom-hat-domain.ts`:

- Original tokens still resolve the same customer links. Admin links are rebuilt from the private original-token column; public DTOs never include it. Original customer details and latest imported revision are preserved; missing historical revisions are not invented.
- Every new submission appends a revision transactionally and advances the current revision. Competing submissions from the same revision return a conflict rather than silently overwriting one another.
- Upload reservations and submissions lock the request; file limits and ownership checks are rechecked under that lock. Fresh files still require R2 existence verification. Expired requests and expired file ownership cannot authorise new work. Preview URLs are signed only for owned, unexpired file keys.
- Normal admin deletion includes submitted and unsubmitted ownership records. Provider deletion must settle successfully before SQL ownership/history/request deletion commits; a failure retains records for retry. Already-deleted provider files are safe to retry through the existing R2 implementation.
- `lib/customHats/storage.ts`, bucket settings, CORS, credentials and browser upload protocols are unchanged. No file copy, URL rewrite or migration-driven deletion is introduced.

### Workers and temporary state

- `lib/reviewScoring.ts` reads/writes scores and retry state in the selected store. Redis retains only advisory ranking leases. Imported retry expiry/attempts/deadlines are honoured, not restarted. `scripts/rank-reviews.ts` uses the same store selection; its npm command supplies the server-only Node condition.
- `/api/cron/review-cleanup` is an authenticated daily cleanup, **a no-op with the default Redis selection**. In PostgreSQL it marks overdue active invitations expired, removes expired unsubmitted review-upload metadata and clears expired ranking retry state. It never deletes reviews, claims, custom-design history, ownership records or provider files. Access checks enforce expiry even before cleanup runs.
- Custom-request/file expiration is enforced on access without automatically destroying retained ownership evidence; normal admin deletion remains responsible for provider-file removal.
- Order completion data, Paystack lookups, outreach/reward email receipts and vouchers remain on their existing paths for later phases. Redis sessions/rate limits remain unchanged. Imports do not schedule emails, issue rewards or trigger custom-submission alerts. Moving communication receipts and introducing a transactional outbox remain Phase 6 work, not part of this adapter switch.

Provider calls cannot commit atomically with PostgreSQL. If file deletion succeeds but SQL persistence fails, records may temporarily refer to a missing file; retry the normal operation after checking status. Do not claim that a database restore restores Blob/R2 files. This phase does not introduce a file-job/outbox framework.

## Import correction discovered during integration

The importer now gives a missing/replaced current-invitation pointer precedence over a historical claim: the invitation remains **revoked**, with the claim/used evidence retained independently. Previously a claim could cause a replaced link to be planned as `used` instead of `revoked`. Omitted duplicate-review claims still cannot reactivate a link.

This changes semantic checksums/digests for affected invitations. The corrected importer was dry-run, compared against a current capture, explicitly approved and bulk-imported using its exact reviewed digest. No earlier imported rows needed updating because the destination was empty before that import. For future captures, treat changed-source checkpoints as a reconciliation gate, not permission to clear them.

## Cutover procedure and remaining acceptance work

The production pause/reconciliation/switch/resume steps below were executed on 21 November; the [cutover log](neon-redis-cutover.md) is the current status. Recovery, full real-provider upload/submission/moderation/deletion smoke checks, extended monitoring and a tested post-write recovery/reconciliation exercise are not yet complete. No automatic Redis cleanup is authorised.

### Cutover preflight — 20 November 2026

- Verified Vercel project access **read-only**. The active production deployment is healthy and matches repository commit `f68521524cf8d5149682044ef10e01ebb97aca04`. It predates the uncommitted Phase 4 paths. `NEON_CONNECTION_STRING`, `REVIEW_CUSTOM_STORE` and `REVIEW_CUSTOM_PAUSED` are not yet configured as project-level Production variables; no values were exposed or changed.
- Prepared an isolated candidate from that exact live commit plus **39 explicitly selected migration files**. Unrelated working-tree document deletions, `.local`, `.env*`, `.vercel`, existing dependencies and generated output were not copied. No user changes were reset, committed or pushed.
- Installed the locked dependencies and ran a clean **production build, including TypeScript: passed**. The earlier whole-workspace type errors came from duplicated generated declarations, which are absent in this clean copy; no generated files in the working repository were deleted to get this result.
- In a local production server with **no production credentials**, confirmed the pause returns the expected 503 for review submission, review access, custom submission and custom upload reservation. The checkout page still returns 200. No provider/production database connection was used by these probes.
- The candidate's full synthetic suite passes: **782 passed, 32 skipped**. Private source hashes/candidate location and outcomes are recorded in `.local/migration/cutover-preflight-1795160963482.json`.
- **Production remains unchanged and unpaused.** This preflight is not proof that old deployments/workers have drained. The next operational action is a production deployment with `REVIEW_CUSTOM_STORE=redis` and `REVIEW_CUSTOM_PAUSED=true`, then final reconciliation before switching to SQL. Obtain the separate production-window/cutover decision, including the already documented unverified-recovery risk, before executing it.

Use the [Phase 3 manual runbook](neon-redis-phase-3.md#minimal-reviewcustom-hat-cutover-runbook-not-yet-executed), with the pause/switch controls above:

1. Recovery remains unverified/deferred; seven-day history alone is not a tested restore. The owner accepted that risk for the bulk import, then separately approved the production cutover on 21 November. Neither approval represents recovery as passed.
2. Prepare a paused deployment on Redis; stop/drain all affected writers/jobs, including `/api/cron/review-cleanup` and in-flight custom alerts/uploads. Verify no old process can mutate these records. Do not interrupt unrelated checkout/payment ingestion.
3. Capture final paused state, review its fresh plan/digest and compare against the baseline. Resolve changed/deleted records and in-flight ownership. The insert-only importer still **does not update/delete an earlier bulk import**; separately reviewed reconciliation remains necessary if drift exists.
4. Both schema migrations and the approved bulk import are now applied; do not rewrite/reapply schema to force reconciliation. Reconcile final changes against the imported baseline. Require zero quarantines and matching read-only verification counts/checksums for the final capture; unchanged/new entities can use the existing checkpointed importer, while edits/deletions need reviewed reconciliation.
5. While still paused, select `postgres` for both domain reads and writes across the web app/jobs/manual tools. Check imported original links, admin views, rankings, pending/rejected photo privacy and unchanged file references. Confirm all old Redis writers have stopped.
6. Resume, then perform controlled upload/submission/moderation/removal smoke checks against the existing Blob/R2 integrations. Monitor SQL/provider errors and workers; do not replay historical messages/rewards. Retain old Redis business keys read-only for the agreed validation period.

**Rollback:** the app is now resumed on SQL. Freeze this domain and reconcile/roll forward; simply switching the environment variable or promoting the old Redis deployment is unsafe. Final reconciliation and live read/privacy checks passed, but the deferred recovery/full provider write-lifecycle/post-write rollback exercises must not be represented as passed. Operational cutover is complete; the remaining acceptance checks are tracked separately.

## Validation

- **25 new SQL integration tests** use disposable in-memory PostgreSQL and synthetic records, with mocked provider/Redis calls. They cover selection/pause/no-fallback, invitation replacement, competing submissions, provider-check races/failures, upload quotas, privacy/moderation/deletion retries, live/test isolation, source expiry, original custom links/latest revisions, ownership, concurrent custom submissions, SQL ranking results/retries and cleanup.
- **3 cleanup-route tests** cover cron authentication, aggregate responses and safe failure. A cache test covers backend separation and preview rejection before a cache hit. Existing Redis-path tests remain active.
- Full suite: **782 passed, 32 skipped**. Changed-file ESLint passes. Whole-project TypeScript reports only the pre-existing duplicate `.next/types` declarations; no Phase 4 type errors remain.
- No remote database, Redis, payment, email, AI or storage-provider connection was used for this phase's tests. Real-world file/link/cutover checks remain gates, not inferred from mocked tests.
