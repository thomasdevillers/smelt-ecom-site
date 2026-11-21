# Review/custom-design production cutover

## Approval and scope — 21 November 2026

The owner approved proceeding without shadow/dual-writing, accepting the previously documented unverified-recovery risk, and requested scoped commits **before** production changes. Scope is reviews/custom designs only; checkout, payment ingestion, Redis operational state, Blob and R2 remain in place. Do not bypass final reconciliation or file-access checks because the rollout is approved.

The previously deployed Redis-only code is commit `f68521524cf8d5149682044ef10e01ebb97aca04`. Migration commits deliberately exclude unrelated document deletions and all local secrets/customer evidence. Applied SQL migrations are additive and must not be rewritten or reversed as a code rollback.

Committed rollback references:

- `pre-neon-review-cutover-2026-11-21`: annotated tag on the Redis-only code above.
- `aab9447`: database foundation and safe import/verification tooling.
- `a355620`: opt-in application paths, pause controls and runtime tests.

These are local Git references; creating them did not push code, deploy or change production configuration.

## Operational sequence

1. Commit the database/import tooling, opt-in application paths, and documentation separately. Retain the pre-cutover commit as the code rollback point.
2. Deploy the committed application with **Production-only** configuration: `REVIEW_CUSTOM_STORE=redis`, `REVIEW_CUSTOM_PAUSED=true`, and the existing private `NEON_CONNECTION_STRING`. Do not put the connection in previews or source control. Confirm pause responses on the live domain before treating the domain as frozen.
3. Drain running review/custom-design requests, workers, manually launched scripts and already-authorised uploads. Prevent superseded deployments or operator tools from continuing to mutate the old domain. A process-scoped pause cannot by itself fence old code.
4. Capture final Redis state, compare against `.local/migration/2026-11-20T07-26-52-062Z`, and verify SQL. Stop on unexplained drift. The insert-only importer can resume unchanged entries/add new entries, but cannot apply edits/deletions by clearing checkpoints.
5. While paused, select `postgres` for reads/writes together, deploy the same code, and verify existing links, published/private photo access, saved rankings, and custom ownership. Only resume once final reconciliation and these checks pass.
6. Resume review/custom-design work and monitor. Retain the old Redis business records without permitting old writers or automatic cleanup. Ordinary application file removal remains with the existing providers.

## Rollback rules

**Before SQL accepts application writes:** keep the domain paused, return the store selection to `redis`, and redeploy the pre-cutover code or the new code in Redis mode. The inactive bulk-imported SQL copy may remain intact. Resume only after checking which store owns the latest writes.

**After SQL accepts application writes:** pause the domain first. Do **not** simply revert commits, promote an old deployment, or flip back to Redis: those actions can lose new reviews/designs or reactivate outdated links. Reconcile new SQL changes back to Redis under the freeze, or roll forward with corrected code, then verify before resuming. No automated reverse-reconciliation tool exists yet.

Source-code commits are rollback aids, not a database/file backup. Reverting code must not drop imported tables, remove file-storage credentials or delete provider files. Recovery verification remains deferred/unpassed.

## Status

Bulk import was completed and verified on 20 November: 291 matching domain entities and 291 checkpoints. A clean isolated production build/type-check and 782 synthetic tests passed. Live pause, final reconciliation, deployment and resume are recorded below as they actually occur; do not infer completion from this runbook.
