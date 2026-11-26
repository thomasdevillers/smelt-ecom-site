# Phase 3 — review/custom-hat import tooling

Status: **initial bulk import completed and verified on 20 November (291 entities); final paused reconciliation and production cutover completed on 21 November (293 matching entities).** Review/custom-design reads and writes now use Neon. Both schema migrations are applied. See the [cutover and rollback log](neon-redis-cutover.md); bulk-import observations below remain historical evidence, not the current application-store selection.

Continuation: offline capture comparison and read-only destination verification are implemented and tested locally. Automatic changed-record/deletion reconciliation and the actual domain switch remain deferred; these tools deliberately report drift rather than resolve it silently.

Phase 4 now provides opt-in SQL application paths and a deployment-scoped pause: [implementation and cutover gates](neon-redis-phase-4.md). Its invitation-revocation correction requires a fresh dry run/digest review before import; no earlier plan approval is carried forward automatically.

## Run a dry run

```sh
npm run migration:reviews -- .local/migration/2026-11-19T07-33-44-340Z
# Owner-approved resolution for this capture's single three-review conflict:
npm run migration:reviews -- .local/migration/2026-11-19T07-33-44-340Z --keep-published-only
```

This reads the existing backup/key locally. It authenticates the archive before processing plaintext, verifies its SHA-256 against the capture summary, validates dump/local-evidence checksums and footer counts, and plans only explicitly `live`/`test` review/custom-hat records. **Dry runs do not open a database, Redis, payment, email, AI or storage-provider connection.**

Only aggregate counts and a deterministic plan digest are printed. Private source-identifier/rejection reports are written, with owner-only permissions, to a fresh `review-custom-<timestamp>/` directory beneath the capture. Original record payloads/token/file-URL values are not copied into those reports, but source identifiers can themselves be sensitive: never publish the reports. The encrypted baseline remains untouched; unknown records remain retained there, not dropped.

`--keep-published-only` implements the owner's explicit **20 November 2026** decision: keep the published review, omit the two rejected duplicates from Neon (no separate history table). It requires exactly one duplicate group of three, with one published and two rejected records. The resulting approval is bound to the exact archive checksum, namespace, order digest and review IDs and included in the reviewed plan/private report. It is not a blanket rule to discard other rejected reviews or choose among multiple published reviews. Without the flag, the original duplicate quarantine remains.

## What is preserved

- Original review IDs, order references, text, rating, consent/disclosure, moderation, timestamps, photos and exact Blob URLs/pathnames. Blank historical email strings remain blank; they are not a reason to invent contact details.
- Invitations and current/revoked/used state, based on the captured current-pointer/claim records. Effective expiry is the earliest applicable absolute source/business deadline, never import time plus a TTL. An expired deadline never becomes fresh. Original invitation details remain JSONB.
- Submission claims, order-level uniqueness evidence and upload reservations. Missing original claim times remain null, not guessed from import time.
- Exception approved by the owner: the two rejected duplicates and their dependent claims/rankings are excluded from the import. Their original encrypted backup records are retained, but no rejected-review history table is created. Invitations keep their original used/revoked/expiry state; omitted claims cannot reactivate old invitation links. Source order/status indexes are rebuilt from retained reviews, even if an old order index points to an excluded rejected ID. No Redis keys or provider files are deleted.
- Saved ranking results/fingerprints/model/rubric and retry state, including original expiry evidence. Nothing is rescored or rescheduled. Operational ranking locks/rate limits remain Redis.
- Custom request IDs, customer details, original active-link tokens/digests, latest available submission/revision and all R2 ownership reservations, including unsubmitted files. Missing earlier revision history is not invented. A submitted file missing from its ownership set blocks that request.

Custom link tokens are private server-side database values (as in the existing Redis source), retained because the admin UI needs to reconstruct existing links. They are not put in public DTOs, terminal output or migration reports. No extra account/role/encryption-key setup is introduced. The existing owner-login security trade-off still applies.

The added database migration, `0001_review_custom_import_checkpoints.sql`, introduces an import checkpoint table and the original-token column. It is **now applied to Neon**, following explicit owner approval. The earlier 12-table migration remains applied and unchanged. Do not rewrite either applied migration.

## Reruns and interruptions

Each entity is inserted and checkpointed in the same PostgreSQL transaction. Checkpoints contain hashed entity identity, a semantic source checksum, archive checksum, destination table and import time. Transaction-level locks serialize competing imports of the same entity.

- Same source + checkpoint: skip, even if the application subsequently edited/deleted that record. Do not overwrite a newer edit or resurrect a deletion.
- Same destination values without checkpoint: compare the values, then checkpoint; no overwrite.
- Changed source or differing destination: stop for explicit reconciliation. Do not use last-write-wins.
- An interrupted run can resume the same reviewed plan; earlier committed entities remain checkpointed. Private per-entity outcome logs use hashed identifiers, not source payloads.
- Minimal `unknown` order-reference stubs satisfy review relationships; an existing paid order/snapshot is never replaced by that stub.

## Applying is a separate step

The implementation supports `--apply --plan=<exact-reviewed-digest>` using `NEON_CONNECTION_STRING`. The owner explicitly approved the current **zero-quarantine** plan's bulk import, accepting that recovery remains unverified; see the actual outcome below. That approval does not include an application cutover. A plan containing any quarantined record is rejected before a database import starts. Schema changes are applied deliberately through the normal migration command, never automatically by the importer. An apply run must include the same resolution flag as the reviewed dry run or its digest will not match.

Keep imports and application cutover separate. This baseline is an online scan from 19 November, not a current atomic snapshot. Before a later domain cutover, capture/reconcile final changes under the agreed domain pause, including deletions, invitation replacements and in-flight uploads. This initial insert-only importer intentionally refuses those changed-source cases; reconciliation/update/deletion tooling and domain pause orchestration are still required. No indefinite dual-writing is introduced.

## Simple reconciliation tools

```sh
# Offline only: compare authenticated captures; no database/provider connection.
npm run migration:reviews -- .local/migration/<baseline> --compare=.local/migration/<final>

# After an explicitly approved import: inspect PostgreSQL without writing anything.
npm run migration:reviews -- .local/migration/<final> --verify --plan=<reviewed-digest>
```

Include `--keep-published-only` when the reviewed captures contain the approved three-review conflict. For comparison, the flag requires that exact conflict shape in **both** captures; a changed/missing group fails closed and requires separate review. Comparison never transfers an old plan approval to a new digest.

- Comparison reports added, changed, removed and unchanged SQL entities, using semantic checksums rather than whole-Redis-hash changes. Removed entities may represent deletion **or expiry**; do not assume either without reviewing the source evidence. Changed invitation state/deadlines and changed upload ownership are included. Unknown/unstable/quarantined sources block comparison; older comparison captures are rejected.
- Verification uses a PostgreSQL-enforced **read-only, repeatable-read transaction**. It compares every planned value, including JSON payloads, timestamps, tokens and file references, and detects missing/changed rows independently of import checkpoints. It also reports unexpected rows in all eight review/custom-hat tables across `live` and `test`, even when a table/environment has no planned rows. It does not inspect unrelated domains or treat import checkpoints as proof of correctness.
- Each table has expected/actual counts and SHA-256 checksums. Verification exits unsuccessfully on any missing, changed or unexpected row. Verification requires the reviewed plan digest but does not require a checkpoint to exist for an otherwise matching record.
- Fresh owner-only `comparison.private.json` / `verification.private.json` reports contain hashed entity identities and outcomes, not payloads, tokens or file URLs. Terminal output remains aggregate-only. Dry run remains the default; `--apply`, `--verify` and `--compare` are mutually exclusive.
- No tool updates/deletes an existing destination row, deletes source keys/files, sends messages, scores reviews or calls payment/storage providers. Reports are evidence for a decision, not cutover approval.

## Minimal review/custom-hat cutover runbook (not yet executed)

Keep this a coordinated manual window rather than introducing a new orchestration service:

1. **Before any customer import:** complete the Neon recovery/restore test and approve the reviewed plan/schema application. Keep Redis authoritative. The existing approved duplicate exclusion must still match the capture; review any new ambiguity.
2. **Prepare Phase 4 code before scheduling the pause.** Switch both reads and writes for the domain together, including shared workers. Do not deploy a half-switched adapter. Phase 4 provides `REVIEW_CUSTOM_STORE` and `REVIEW_CUSTOM_PAUSED`; they are process/deployment scoped and do not drain old work automatically.
3. **Pause mutations and wait for running work to finish.** Cover review submission/access/invitation/upload routes, admin review actions, custom-hat submission/upload/admin actions, `/api/cron/review-requests`, `/api/cron/review-rewards`, `/api/cron/review-rankings`, and manual `scripts/rank-reviews.ts`. These depend on `lib/reviewStore.ts`, `lib/reviewAutomation.ts`, `lib/reviewScoring.ts` and `lib/customHats/store.ts`. Include old deployments and manual admin clients; disabling cron scheduling alone does not stop an in-flight invocation. Leave checkout, payment ingestion and unrelated jobs alone.
4. **Drain uploads, then capture final state.** Block new upload reservations/submissions; allow already-authorised Blob/R2 transfers to settle, then reconcile their reservations, completed submissions and ownership sets. Preserve unsubmitted ownership reservations too. If a request/worker can still write metadata, the pause is not complete. Do not delete orphan-looking files as migration cleanup.
5. **Compare baseline and final captures offline.** Review all additions/changes/removals, replaced invitations and expiry evidence. If an earlier bulk import exists, stop on drift: the insert-only importer cannot apply edits or deletions. Use a separately reviewed reconciliation change before proceeding; never clear checkpoints or truncate imported tables to force a rerun.
6. **Import the approved final plan, then verify it.** Apply versioned schema deliberately first; import with the exact final plan digest. Require matching counts/checksums and zero quarantines or missing/changed/unexpected destination rows. Resolve mismatches while the domain remains paused. Verification alone does not test public links or provider file access.
7. **Switch, smoke-test, resume.** Deploy the reviewed Phase 4 read/write/worker changes together. Test old invitation/custom links, private photo access, moderation and upload ownership against the unchanged Blob/R2 integrations. Resume jobs only after those checks; ensure accepted communication/reward history cannot replay. Retain Redis business keys read-only for the agreed validation period, without automatic cleanup.

Before Neon accepts application writes, a failed cutover can leave/revert the app on Redis while keeping imported copies inactive. **After Neon accepts writes, do not simply redeploy old code:** freeze this domain, reconcile the new writes back or roll forward. A tested recovery procedure and the Phase 4 pause/switch implementation are still required before executing this runbook.

## Actual dry-run findings — 20 November 2026

The preferred encrypted baseline contains **409 review/custom-hat source keys**. The latest dry run prepares:

| Destination | Entities |
|---|---:|
| Reviews | 25 |
| Invitations | 214 |
| Submission claims | 24 |
| Saved rankings | 25 |
| Custom requests | 1 |
| Custom file ownership | 2 |

The first dry run had **7 quarantine findings**: three reviews sharing one order reference and four dependent claim/ranking findings. Following the owner's decision, the revised run retains the published member and excludes the two rejected members plus **two associated claim records**, leaving **zero quarantines**. Only this specifically approved group is resolved. Source status indexes are checked against all valid archived review records, then marked for SQL-index rebuilding rather than independently copied.

The owner declined the proposed separate rejected-review history representation and instructed: **only keep the published one**. That decision is now implemented for the import. The existing encrypted backup retains the excluded originals; no source deletion or file cleanup was performed.

One historical review has an empty email; its original value is preserved. It is not quarantined for that alone. No new customer identity or paid-order relationship is inferred.

### Rerun after the Phase 4 invitation correction

The owner requested another dry run on **20 November 2026**, after deferring recovery troubleshooting. The current importer was rerun against the authenticated **19 November 07:33 UTC baseline**, not a newly captured or paused Redis snapshot:

- **291 planned entities, zero quarantines**; the table counts above are unchanged.
- The two rejected duplicates and two dependent claims remain excluded under the existing approval. Replaced links now retain revocation even when historical claim evidence exists.
- Plan digest: `5ce4162783979c8f145071be4c36b77259f263280d479ca6ac8ff36c93114ae3`.
- Owner-only report: `.local/migration/2026-11-19T07-33-44-340Z/review-custom-1795159515519/plan.private.json`.
- **24 importer/reconciliation tests pass** on this rerun. No database/provider connection, schema change, customer import, source mutation or app switch occurred.

This validates the updated baseline plan only. Final cutover still needs current source capture/reconciliation under the agreed pause; this digest is not approval to import or switch production.

### Current capture and comparison — 20 November 2026

At the owner's request, captured the current Redis source read-only from **07:26:52 to 07:28:37 UTC**, then dry-ran and compared the review/custom-hat plans:

- Encrypted capture: `.local/migration/2026-11-20T07-26-52-062Z` (**1,772 total Redis keys**, 130 private local evidence files encrypted). Its source fingerprint matches the 19 November baseline; no keys vanished during this scan.
- Review/custom-hat slice: **409 source keys**, **zero unstable keys**, **291 planned entities**, **zero quarantines**. Counts and the approved duplicate exclusions are unchanged.
- Comparison: **0 added, 0 changed, 0 removed, 291 unchanged**. No reconciliation writes are needed between these two plans. This does not prove that a later final capture will also have no drift.
- Current plan digest: `062f96126ec253b205dad9598f2ca1ac0a6bb37e563851e26c76c7b97c9deb63`.
- Archive SHA-256: `8a0cbdb40429f05d0e9d007b919ab907486de890c3c4df72647d631b1d73aadb`.
- Private plan report: `.local/migration/2026-11-20T07-26-52-062Z/review-custom-1795159727497/plan.private.json`.
- Private comparison: `.local/migration/2026-11-19T07-33-44-340Z/review-custom-1795159732767/comparison.private.json`.

Capture used allowlisted Redis reads only. Planning/comparison authenticated and checksum-verified the encrypted archives without database/provider connections. No schema application, customer import, messages/rewards, provider-file operations, pause, deployment or app switch occurred. This is an **online scan, not a paused atomic cutover snapshot**. Recovery remains unverified/deferred; customer-import risk acceptance and production cutover approval have not been inferred from the capture request.

## Validation

### Owner-approved Neon bulk import — 20 November 2026

- The owner explicitly approved applying the pending schema and bulk-importing the reviewed current plan while accepting the **unverified recovery** risk. No broader cutover, source deletion, file operation or automatic cleanup approval is inferred.
- Preflight confirmed the destination was the previously verified **working Neon endpoint**, not the recovery-test endpoint, with zero business rows. Local application selection was `redis` and was not changed.
- Applied `0001_review_custom_import_checkpoints.sql`; the normal migration history check now reports **0 pending**.
- Imported exact plan `062f96126ec253b205dad9598f2ca1ac0a6bb37e563851e26c76c7b97c9deb63` from `.local/migration/2026-11-20T07-26-52-062Z`, retaining the approved published-only duplicate resolution.
- The first command reached its 120-second execution limit after **72 committed insert/checkpoint outcomes**. The process was confirmed stopped before rerunning the same reviewed plan with a longer command window. Resume reported **219 inserted, 72 checkpoint skips, 0 conflicts**. No record overwrite, checkpoint reset or cleanup was used.
- Read-only, repeatable-read SQL verification: **291 matched, 0 missing, 0 changed, 0 unexpected**. Counts and checksums match for all eight domain tables, including the two empty tables. All **291 import checkpoints** match this archive; both deliberately omitted rejected-review IDs are absent.
- Destination domain counts: 25 reviews, 214 invitations, 24 claims, 25 rankings, 1 custom request and 2 custom file ownership rows. Review-upload and custom-revision tables have zero rows, matching the source plan. Review photo references remain inside the preserved review payloads; no missing submission/revision history was invented.
- **142 `unknown` order-reference stubs** satisfy relationships. Their money/currency are null and snapshots empty: these are not imported Paystack payments or fulfilment history. No customers, paid orders or historical prices were invented.
- Private interrupted outcomes: `.local/migration/2026-11-20T07-26-52-062Z/review-custom-1795159955398/`.
- Private completed outcomes/result: `.local/migration/2026-11-20T07-26-52-062Z/review-custom-1795160108572/`.
- Private successful verification: `.local/migration/2026-11-20T07-26-52-062Z/review-custom-1795160529256/verification.private.json`.
- The **66 targeted importer/foundation/domain tests** passed before application. No code/deployment/environment changes, Redis writes, email/payment/AI calls or Blob/R2 operations occurred during the import/verification.

**At bulk-import completion:** Redis remained authoritative. The subsequent pause/drain, final captures, exact one-submission reconciliation, SQL verification and separately approved cutover were completed on 21 November; see the [cutover log](neon-redis-cutover.md). Changed/deleted source records were not forced through by clearing checkpoints.

### Earlier local validation

- **24 importer/reconciliation tests**, plus **17 database foundation tests**, cover synthetic fixtures and isolated local PostgreSQL, including approved published-only exclusion and reruns.
- Coverage: authenticated input, checksums/counts, deterministic planning, default whole duplicate-group quarantine, exact-group/archival approval matching, preservation of unrelated rejected reviews, excluded claim/ranking handling, used-invitation safety, rebuilt stale order pointers, unknown/unstable/orphan sources, missing R2 ownership, original deadlines/tokens/revisions, interruption/resume, matching existing records, changed-source/destination conflicts, no newer-record overwrite/deletion resurrection, and blocking quarantined plans before writes.
- The actual approved backup plan was also replayed in **disposable local in-memory PostgreSQL**: **291 entities inserted**, then **291 checkpoint skips** on a repeat run. All 25 retained review payloads matched the plan; both excluded IDs were absent. The database was closed/discarded, with no Neon connection or persistent plaintext database created. This is SQL/import validation, not a Neon recovery test or production import.
- Continuation coverage includes deterministic/private capture comparisons, unchanged entity checksums across archives, additions/changes/removals, older/quarantined capture rejection, matching SQL checksums, edited/deleted checkpointed destinations and unexpected rows in an otherwise empty environment. The **41 targeted tests** pass; importer ESLint passes.
- Latest full suite: **753 passed, 32 skipped**. `git diff --check` passes. The continuation used synthetic local fixtures only; no Neon connection or customer-data import was made.
- TypeScript remains blocked only by the existing duplicate `.next/types` generated declarations; no importer-file type errors remain.
- No customer-data import, Neon schema modification, source mutation, provider call or external-file operation occurred during the earlier dry runs. The later explicitly approved Neon import is recorded separately above; the working database is no longer empty.

Neon recovery history is confirmed by the user as **7 days**. Recovery troubleshooting is **deferred at the owner's request**; the attempted restore remains unverified, not passed. The owner separately accepted that risk for the bulk import and the later production cutover. See [recovery-test status](neon-redis-recovery-test.md) and [cutover evidence](neon-redis-cutover.md).
