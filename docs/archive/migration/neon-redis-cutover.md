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

**Before SQL accepts application writes:** keep the domain paused using the new pause-capable code, return the store selection to `redis`, and redeploy in paused Redis mode. The inactive bulk-imported SQL copy may remain intact. Resume only after checking which store owns the latest writes. The pre-cutover code does not understand the new pause flag, so promoting it would resume its old Redis workflows immediately; do not use it as a way to keep a freeze in place.

**After SQL accepts application writes:** pause the domain first. Do **not** simply revert commits, promote an old deployment, or flip back to Redis: those actions can lose new reviews/designs or reactivate outdated links. Reconcile new SQL changes back to Redis under the freeze, or roll forward with corrected code, then verify before resuming. No automated reverse-reconciliation tool exists yet.

Source-code commits are rollback aids, not a database/file backup. Reverting code must not drop imported tables, remove file-storage credentials or delete provider files. Recovery verification remains deferred/unpassed.

## Status

**Production cutover completed on 21 November 2026.** Reviews/custom designs now read and write Neon, with `REVIEW_CUSTOM_STORE=postgres` and `REVIEW_CUSTOM_PAUSED=false` in Vercel Production and the operator's private local environment. Other domains remain on their existing stores. Recovery is still unverified, with the risk explicitly accepted; no restore was represented as passed.

### Committed and deployed

- The three scoped commits (`aab9447`, `a355620`, `f616b09`) and annotated pre-cutover tag were pushed to GitHub before resuming. Unrelated document deletions remain local and uncommitted.
- Built deployment sources from committed `f616b098070a81e1d942e6327046067cd596af26`, excluding private environment/evidence/generated files. All 39 migration runtime/tooling source hashes matched the previously clean-build-tested candidate.
- Added the existing Neon connection as a **sensitive Production-only** Vercel variable. No preview/development target, provider credentials, storage bucket/CORS settings or checkout configuration were changed.
- Paused Redis deployment: `dpl_DveZvR19yrA8fCy8sazLnB4cfVSm`. Pause responses were confirmed on canonical `https://www.saunahat.co.za` at **09:05:53 UTC**; checkout returned 200. The apex domain redirects to `www`; mutation probes used the canonical origin rather than bypassing same-origin checks.
- Existing Vercel protection (`all_except_custom_domains`) blocks unauthenticated access to superseded deployment URLs. The prior Redis-only deployment's mutation endpoint returned 401 before application execution. No matching local review/design writer processes were running. Do not manually run old authenticated deployments or old operator code against retained Redis business keys.

### Final reconciliation

- First paused capture: `.local/migration/2026-11-21T09-06-22-004Z`. It found one completed customer submission since the 20 November bulk copy: **one new pending review (with its existing photo reference), one claim, and its invitation changing active → used**. No removals/quarantines or other changed fields.
- Rehearsed this exact transition against disposable in-memory PostgreSQL with remote access forbidden; no persistent plaintext/customer database or test-provider operation was created.
- Applied an exact-plan reconciliation in **one PostgreSQL transaction**, checking the old destination values and checkpoint hash first. Added the review/claim and advanced only that invitation/checkpoint. No blanket overwrite, checkpoint clearing, file rewriting, email, payment or AI action occurred.
- SQL verification after reconciliation: **293 matched, zero missing/changed/unexpected**. Domain counts: 26 reviews, 214 invitations, 25 claims, 25 rankings, 1 custom request, 2 custom files; review-upload and custom-revision tables remain empty as in the source. Original embedded review photos and both submitted/unsubmitted custom ownership references are preserved.
- Second paused capture: `.local/migration/2026-11-21T09-15-51-497Z`, after the drain window. Comparison against the first paused capture: **293 unchanged, zero added/changed/removed**. No review-upload reservations were present; retained custom ownership matches the pre-window snapshot. SQL again matched all 293 entities against this final capture.
- Final cutover plan: `6ccfa904a5a6322694e8c3ea3616defe029942c574273963ac3ab4a449e4dd1c`. Archive checksum: `b7dafd35b1617f543462e8c7af4b8ebb147bc75af6398f18ee4a37fa05fb9a89`.
- Private evidence: `.local/migration/cutover-submission-reconciliation-*.private.json`, the two encrypted captures and their comparison/verification reports. The one-off operator script and its private offline rehearsal contain no connection secrets and are not deployed or included in ordinary test discovery.

### SQL activation and resume

- Deployed the same committed code with SQL selected **while still paused**: `dpl_3FCD1VEoCBqzxwxYTVPtBcjGVJ3v`. Read-only live checks passed before resuming. The GitHub deployment for the pushed commit also completed successfully under paused SQL configuration.
- Set the Production pause flag to false, then deployed the live SQL version: **`dpl_8LXwaPppejUqgHhbpuPiWofGEbyT`**, `smelt-ecom-site-hvyeb3p8x-thomasdevillers-projects.vercel.app`. Live checks completed at **09:20:18 UTC**.
- All **25 published reviews** served by the live API matched SQL. A published photo loaded (153,698 bytes); the same photo checksum matched before/after resume. A pending photo returned 404 without admin access. The existing custom-design token resolved its original customer DTO without exposing the token, and existing active/used invitation digests resolved with the correct SQL usage state.
- Invalid-token submission/upload probes returned the expected 404 after resume (rather than the paused 503), without reserving uploads, submitting records or sending alerts. Checkout still returned 200.
- Live smoke checks were read-only except for invalid-token probes, which failed before business writes. **No synthetic customer review/design was submitted, no test upload/moderation/deletion was performed, and no message/payment/provider-file mutation was triggered by this cutover.** Full real-provider write-lifecycle smoke testing remains a follow-up, not a claimed result of mocked tests or these read checks.
- Redis business keys were not deleted or rewritten. Retain the encrypted captures and old keys under their existing expiry policies; do not allow old code/jobs to write them. Sessions, rate limits, locks, checkout/order/communication/inventory domains and existing file providers remain operational.

From resume onward, treat Neon as authoritative even if no customer write has yet been observed. Any rollback must follow the post-write freeze/reconciliation rule above; do not promote the Redis-only tag directly onto live traffic. Continue monitoring provider/SQL errors and validate controlled write lifecycles before calling every Phase 4 acceptance/recovery gate complete.
