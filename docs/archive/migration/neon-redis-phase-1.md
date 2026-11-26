# Phase 1 — Redis inventory and recovery baseline

Status: **technical inventory/recovery work verified; awaiting provider billing/storage and recovery-settings exports to finish Phase 1. Not approval for a production migration.**

This phase adds operational CLI tooling only. Business reads/writes, jobs, payments, email sending, uploads, Vercel Blob and R2 behaviour are unchanged. The user separately authorised one normal admin login/logout for dashboard measurements; its temporary session and login-rate counters are the only intentional operational writes. Existing unrelated working-tree changes are not part of this work.

## Source-to-destination register

`{env}` means ownership explicitly present in the key, not inferred from the local Paystack key. Actual counts, types and TTLs are recorded per family/environment/type in the private `summary.json`. Exact keys, values, timestamps, provider IDs, tokens and frozen messages are encrypted in the baseline archive.

| Redis source | Datasets to preserve | Destination / decision | Primary code owner |
|---|---|---|---|
| `smelt:reviews:v1:{env}:*` | `records`, status indexes, invitations, order/invitation and order/review uniqueness lookups, submission claims, upload-path ownership, rankings/scores/retry state | Neon; preserve review IDs, consent, moderation, invitation replacement and expiry. Rebuild indexes only after reconciliation. Access-rate and ranking locks remain Redis. | `lib/reviewStore.ts`, `lib/reviewScoring.ts` |
| `smelt:custom-hats:v1:{env}:*` | requests/submissions/revisions, token lookups, `files:{requestId}` reservation/ownership sets | Neon; preserve required active token material and exact R2 keys. Ownership sets include in-flight uploads, not just submitted artwork. | `lib/customHats/store.ts` |
| `smelt:inventory:v1:{env}:*` | available stock, reservations, expiry index, committed references; discovered `correction:*` historical adjustment marker | Neon transactional stock/reservation ledger and adjustment audit history. Quarantine the correction marker for provenance review; retain it to prevent repeat adjustments. No expiry-based release without payment reconciliation. | `lib/inventory.ts`; historical operator for correction marker requires confirmation |
| `smelt:preorders:v1:{env}:*` | orders/allocations, per-batch capacity, received markers | Neon; preserve old and current batches, original allocation quantities and completion markers. | `lib/purchaseStore.ts` |
| `smelt:coupons:v1:{env}:*` | coupon codes/index, reservations, held/redeemed/usage counters | Neon; reconcile balances and reservations atomically. Current coupon amounts are whole rand, **not cents**; convert deliberately to minor units. | `lib/coupons.ts` |
| `smelt:vouchers:v1:{env}:*` | codes, held/redeemed balances, reservations, reward records, reward queue | Neon; preserve sources, expiry, customer binding and exactly-once reward issuance. Current voucher amounts also use whole rand. Validation rate limits remain Redis. | `lib/vouchers.ts` |
| `smelt:orders:completed:v1:{env}` | completion timestamps keyed by original order reference | Neon fulfilment records, not a replacement for Paystack payment history. | `lib/admin/orders.ts` |
| `smelt:orders:review-message-sent:v1:{env}` | manual review-message dates | Neon communication history; preserve independently of automation receipts. | `lib/admin/orders.ts` |
| `smelt:shipping:order:v1:*` | order-linked shipping receipt | Neon shipments, preserving references. **Environment ambiguous.** | `lib/admin/orders.ts`, `lib/admin/shipping.ts` |
| `smelt:shipping:receipt:v1:*` | email/waybill pair receipts, pending messages, provider IDs | Neon shipments/communication receipts; do not invent an order relationship. **Environment ambiguous.** | same; `scripts/import-shipping-receipts.ts` |
| `smelt:shipping:history:v1:*` | per-email shipment history | Neon shipping history; compare with pair and order records before deduplication. **Environment ambiguous.** | same |
| `smelt:order-confirmation:v1:*` | customer accepted/pending receipts, original frozen messages and retry starts | Neon durable email receipts/outbox. **Environment ambiguous**; never reset send windows or interpret missing receipts as new payments. | `lib/orderConfirmation.ts` |
| `smelt:owner-order:v1:*` | owner accepted/pending receipts | Same, separate audience and historical start date. **Environment ambiguous.** | same; `lib/admin/emailAudit.ts` |
| `smelt:review-outreach:v1:{env}:*` | request/reward receipts, skipped/manual resolutions | Neon communication history and jobs. Advisory request/reward locks remain Redis. | `lib/reviewAutomation.ts` |
| `smelt:review-refund-campaign:v1:{env}:*` | historical request receipts and delivery checks | Neon campaign history; reconcile against outreach scheduler records without re-sending. Preserve local campaign plan/log evidence. | `.local/review-refund/send-customer-campaign.ts` (private operational script) |
| `smelt:customer-thank-you:v1:{env}:*` | recipients/frozen messages, provider IDs, idempotency keys, daily attempts | Neon campaign history and durable send caps; even counters that limit sends must survive Redis loss. Advisory lock remains Redis. | `scripts/send-customer-thank-you.ts` |
| `smelt:email-audit:v1:{env}:*` | latest audit and handled resolutions | Neon; preserve resolutions, retain report for baseline even if later declared rebuildable. | `lib/admin/emailAudit.ts` |
| `smelt:followup:v1:*` | checkout leads/consent, owner notice receipts, due/customer-due queues | Neon with existing expiry deadlines; queues become durable jobs. **Environment ambiguous.** Advisory lock remains Redis. | `lib/checkoutFollowup.ts` |
| `smelt:cart-email:v1:{env}:*` | campaigns, step receipts, recovery/unsubscribe links, suppressions and queue state | Neon; retain current retention: campaign 30 days, recovery 10 days, unsubscribe 2 years (verify each stored TTL; do not reissue TTLs). Locks remain Redis. | `lib/cartEmailSequence.ts` |
| `smelt:restock:v1:{env}:*` | WhatsApp restock signups and notification dates | Neon; retain legacy batch identity and consent/history. | `lib/restock.ts` |
| `smelt:restock-email:v1:{env}` | email restock signups and notification dates | Neon; preserve source/history. | `lib/restockEmail.ts` |
| `smelt:ask-hat:conversations:v1:{deployment}:*` | index, per-conversation metadata and turns, including pending/error turns | Neon; deployment namespace is **not proof of live/test payment ownership**. Approve explicit transcript retention before import. | `lib/hatConversations.server.ts` |
| `smelt:ask-hat:v1:{deployment}:*` | temporary question rate limits | Retain Redis and current TTL. | `lib/askHat.server.ts` |
| `smelt:admin:session:v1:*`, `smelt:admin:login:*` | sessions and login rate limits | Retain Redis and current TTL. Do not import session secrets into business tables. | `lib/admin/auth.ts` |
| Unnamespaced, unknown family/version/suffix/field | anything not explained above | **Quarantine, retain encrypted source and request owner/schema review. No default deletion or automatic import.** Family classification in CLI output is a discovery aid, not approval of all suffixes/payloads. | requires triage |

### Legacy, expired and obsolete records

- Old batch/campaign dates are historical business evidence, not automatic obsolescence.
- Keep explicitly test/local data separate from live; do not relabel `production` conversations as payment-mode `live`.
- Records without explicit ownership remain quarantined for environment resolution even when their domain destination is known.
- Preserve absolute expiry deadlines. Expired links/reservations may remain historical records, but must not become actionable again. Stock holds require payment reconciliation, not TTL-based assumptions.
- Keys already expired before scanning are not discoverable. Recover them only from existing provider backups/logs if available; do not claim the online baseline includes them.
- No obsolete-key deletion has been approved. Unknown or malformed records and local artifacts remain retained pending review.

### Provider IDs, idempotency and pending work

Receipt payloads and private workflow evidence preserve provider `id`/`emailId`, frozen messages, statuses, retry counts and timestamps verbatim. Some idempotency identifiers are derived by the existing code rather than stored; preserve these exact constructions in later imports (the following are templates, not customer values):

| Workflow | Existing Resend idempotency identifier |
|---|---|
| Customer/owner confirmations | `order-confirmation/{sha256(reference)}` / `owner-order/{sha256(reference)}` |
| Shipping, manual or dashboard | `shipping-{sha256(lowercaseEmail + "\n" + waybill)}` |
| Review invitation / reward | `review-request/{sha256(reference)}` / `review-reward/{reviewId}` |
| Cart sequence | `cart-recovery/{campaignId}/{step}` |
| Owner checkout notice | `checkout-followup/{notice.lead.version}` |
| Historical refund campaign | `review-refund/2026-10-08/{sha256(reference)}` |
| Thank-you campaign | stored `idempotencyKey` in each recipient record |

Resend retry windows in these senders are generally capped at 23 hours from the original attempt. Local shipping receipts use ISO `attemptedAt`/`acceptedAt`; shared shipping records use numeric `startedAt`. Keep their source representation and units in the baseline. Never restart a deadline during import. A notice's `delivered` boolean is distinct from other receipts' `status`; neither absent provider IDs nor a timed-out call proves no message was sent. Audit Resend read-only before resolving ambiguous sends.

Stock/purchase allocations, committed-reference deduplication, per-batch capacity/received markers, voucher `heldBy`/`redeemedBy` and coupon held/redeemed/usage counters are retained together with their source keys. Their hashes/sets are not disposable caches. Do not recalculate balances from current product prices, release old holds, issue rewards or retry messages as part of Phase 1.

## Capture and audit runbook

```sh
npm run migration:capture
npm run migration:audit -- .local/migration/<capture-directory>
npm run migration:restore-test -- .local/migration/<capture-directory>
npm run migration:triage -- .local/migration/<capture-directory>
npm run migration:package -- .local/migration/<capture-directory>
```

For a running capture, `npm run migration:finalize -- .local/migration/<capture-directory>` waits for completion through filesystem events (no Redis/file polling), verifies the archive checksum, then runs the private audit and isolated restore test. It stops on any failure and times out after 45 minutes. Use either this command or the two individual follow-ups, not both: private reports intentionally refuse to overwrite existing evidence.

Capture uses the existing private `.env.local`; credentials are never added to source or reports. For future runs, request a dedicated ACL token restricted to the required read commands, including `SCAN` and `DUMP`; Upstash's default Read Only token can restrict `SCAN`. Creating an ACL user requires separate approval. Source access in this CLI is restricted by a command allowlist: incremental `SCAN`, metadata/cardinality reads, incremental collection scans, and binary-safe base64 `DUMP`. No `KEYS`, `EVAL`, mutations or external provider calls occur in capture. Batches are bounded to 25 keys with pipelined reads; scan duplicates are deduplicated. Changed dump bytes are checked semantically to avoid confusing collection serialization order with mutations. The REST encoding/pipeline behaviour was verified against the [Upstash REST reference](https://upstash.com/docs/redis/features/restapi).

Private artifacts (all excluded by `.gitignore` and `.vercelignore`):

- `.local/migration/backup.key`: 32-byte AES key, mode `0600`. **Escrow separately in a secure vault/off-machine location.** Keeping the only key beside the archive is not disaster recovery.
- `<capture>/baseline.jsonl.gz.aes` plus `.tag`: gzip JSONL encrypted with AES-256-GCM, per-archive random nonce and authenticated contents. Both files are required.
- `<capture>/summary.json`: aggregate counts, types, TTL ranges, instability, latency and archive checksum.
- `<capture>/audit.private.json`: **sensitive plaintext**, mode `0600`; exact file references, workflow records and local audit evidence. Never publish, attach to issues or copy to docs. Delete only with explicit retention approval.
- `<capture>/restore-test.json`: local restore verification outcomes; not a production restore authorisation.
- `<capture>/triage.jsonl.gz.aes` plus `.tag`: authenticated per-key proposed destination/quarantine decisions, financial snapshots and per-artifact receipt evidence. `triage-summary.json` contains only aggregates.
- `<capture>/provider-reconciliation.jsonl.gz.aes` plus `.tag`, when generated: read-only observations of existing Resend message metadata. Never a retry authorisation.

Archives preserve source `DUMP` payloads with SHA-256 checksums and logical values for review. Source dumps bracket logical reads to flag possible changes. This is an **online, non-atomic baseline**, not a point-in-time database snapshot; stable individual keys do not prove cross-key consistency. Final cutover still needs domain pauses/reconciliation and provider recovery coverage.

Redis expiry deadlines in the first running baseline are estimates from local wall-clock time plus `PTTL`, not server-authoritative expiration timestamps; its estimated deadline can be late by request latency. Subsequent captures use server-authoritative `PEXPIRETIME`, whose support was verified read-only against this endpoint. Do not use the first baseline's estimated Redis deadlines for an exact production TTL restore. Retain explicit business `expiresAt` fields verbatim and reconcile server-authoritative expiry deadlines in later import tooling. The local restore test verifies the archived deadlines, not their precision against the running source.

Local audit covers non-symlink `.json`, `.jsonl`, `.csv` and `.log` artifacts beneath `.local`, excluding admin credentials, migration output and dependency directories. `.env` files, HTML previews and operational source files are not copied into the archive. Source files are inspected separately to identify legacy writers. Unparseable data is retained for manual review. Shipping receipt comparison checks exact email/waybill key, provider ID and status; other identifier matches are candidates only, never proof of complete shared persistence. No local receipts are imported.

The private thank-you campaign's saved production environment points to the same Redis endpoint as the supplied source. No alternate endpoint was queried and no environment-file contents were copied into the baseline.

### Isolated restore prerequisite

The restore test expects a locally built Redis 8.8.0 binary at `.local/migration/redis-8.8.0/src/redis-server`. The captured Upstash dumps use **RDB version 14**; Redis 8.2.3 supports only version 12 and rejected them. No archive bytes were modified to bypass that check. No system service or production connection is used. To prepare the compatible binary, download the release archive from `https://download.redis.io/releases/redis-8.8.0.tar.gz`, verify its provenance/checksum, extract under `.local/migration`, then run `make -j4 BUILD_TLS=no redis-server` in that directory. Build `redis-cli` separately for the opt-in synthetic integration test. Do not run application integration tests against production credentials.

Restore authenticates the entire archive **before any plaintext is used**, verifies source/local checksums and footer counts, launches a fresh Redis with TCP disabled and a private Unix socket, and uses `RESTORE` only there. It checks types, canonical logical values, absolute TTL deadlines and key counts, skipping already expired source keys. Redis memory is discarded when the process exits; persistence is disabled. External files are deliberately not fetched or restored. Local artifacts are checksum-verified but not written over their original paths.

## Remaining Phase 1 gates

Read-only `INFO memory` reported `used_memory=252321` and `maxmemory=3221225472` during discovery. These are provider-reported Redis fields, not an independently verified storage measurement, account plan allowance or billing export. The scan itself adds billable read commands under the existing provider plan; actual costs remain unverified.

Validation: **12 migration tests pass**, including bounded capture, source mutation rejection, expiry/semantic-change handling, authentication-before-decryption, local evidence triage, provider identifier selection and an opt-in five-type synthetic capture/audit/restore/triage/package recovery chain. Migration scripts pass ESLint. The earlier broader test run passed 701 tests, with the existing custom-hat suite unable to load the missing local `aws4fetch` package. Whole-project type-checking is blocked by that missing package and duplicate generated `.next/types` declarations; no migration-script type errors were reported. No production-write integration tests were run.

- [x] Complete encrypted baseline capture, private local/file-reference audit and isolated native restore verification.
- [x] Map every captured Redis key and classify every local artifact; keep ambiguous environments/adjustment provenance explicitly quarantined rather than infer ownership.
- [x] Recheck the 19 possible-change flags and recapture using server-authoritative expiry deadlines. Refreshed capture has zero unstable records; all 19 original flags were semantically unchanged across captures.
- [x] Audit local campaign/receipt evidence; preserve local-only and unresolved evidence with explicit non-actionable retention/quarantine decisions. No imports or send retries performed.
- [x] Measure authenticated dashboard page/list/search/export latency with dataset counts and region hints; user-authorised login and logout completed normally.
- [x] Prepare a checksummed encrypted handoff, exclude the key, extract it and verify recovery locally. User chose **local handoff only**; off-machine transfer/key escrow is deferred, not performed or claimed.
- [ ] Confirm provider recovery/PITR settings and latest successful recovery point from user-supplied exports; capture an existing consistent provider backup if available/authorised. Do not enable/change provider settings without approval.
- [ ] Record actual Upstash/Vercel/Blob/R2/Resend costs and provider storage/billing usage from user-supplied exports. Account billing is unavailable with the current project credential (403). No pricing estimates should be treated as observed costs.

The user selected dashboard exports as the evidence source. Place redacted files in `.local/migration/provider-evidence/`; its private `README.md` lists the exact requirements. The directory currently has no provider exports. Waiting on that evidence is a real completion blocker, not a reason to repeatedly read Redis or invent costs.

**Later cutover requirements, not discovery changes:** resolve quarantine ownership before import, approve transcript/local-artifact retention, freeze legacy writers at the appropriate domain pause, and separately approve destination/retention/deletion decisions. Unknown records may remain quarantined in the Phase 1 deliverable. No legacy jobs are disabled in Phase 1. Off-machine recovery is strongly recommended before production changes but was explicitly deferred in this handoff.

Do not begin a production cutover on the strength of an inventory or successful local restore alone.

## First capture observations — 19 November 2026

- Capture completed at `2026-11-19T07:26:23Z`, after approximately 26 minutes.
- `DBSIZE` was 1,777 before and after; incremental scan captured 1,777 unique keys, with none vanishing during capture. Equal counts do not establish point-in-time consistency.
- 130 private local artifacts were encrypted alongside Redis data; no environment files or storage-provider files were copied.
- 10,686 source read commands; observed local REST pipeline p50 approximately 678 ms and p95 approximately 743 ms. These are not authenticated production-dashboard benchmarks.
- Private audit found 25 local shipping receipts with matching shared status/provider ID. Another 105 artifacts require manual review, **not necessarily 105 missing shared records**.
- File-reference audit found 28 Blob URL occurrences and 2 R2 key occurrences; these are occurrences, not unique physical-file counts. No submitted R2 file keys were missing from their request ownership sets. Physical object existence and file access were not tested.
- The initial native restore attempt failed on the local Redis/RDB version mismatch described above. **Redis 8.8.0 verification passed at `2026-11-19T07:29:12Z`: all 1,777 keys restored, no expired keys skipped, logical values/types/archived deadlines/counts matched, and all 130 local-artifact checksums verified.** This is tested local recoverability, not approval of an exact production recovery point or application-level restore.
- Redis types: 1,572 strings, 198 hashes, 4 sets and 3 sorted sets. 650 keys had TTLs; 1,127 were persistent.
- Explicit namespaces: 821 `live`, 5 `test`, 4 `local-preorder-test`, and 19 deployment-scoped `production` conversation keys. **928 keys have ambiguous payment-environment ownership** and remain quarantined for that decision.
- 19 source keys were flagged by differing bracketing dumps. These require review; differing hash/set serialization can also trigger the flag. Do not treat this as evidence that 19 business records changed.

### Observed Redis family counts

| Family | Keys |
|---|---:|
| Reviews | 406 |
| Shipping order / receipt / history | 139 / 164 / 161 |
| Customer / owner order confirmations | 221 / 177 |
| Cart email | 205 |
| Review-refund campaign | 110 |
| Checkout follow-up | 66 |
| Review outreach | 55 |
| Vouchers | 24 |
| Saved conversations | 19 |
| Preorders | 9 |
| Coupons | 6 |
| Inventory, including correction marker | 5 |
| Custom hats | 3 |
| Thank-you campaign | 2 |
| Email audit | 2 |
| Order completion / review-message dates | 1 / 1 |
| Email restock | 1 |
| **Total** | **1,777** |

No keys from the code-known admin/session, short-lived ask-hat rate-limit or WhatsApp restock namespaces were found in this capture. Their absence now does not authorise removal of those integrations.

### Local-artifact retention register

All 130 artifacts remain encrypted and retained; no cleanup/deletion is approved. In particular, private historical preorder-delay campaign records are an additional local source, even though no matching Redis namespace was discovered.

| Local category | Artifacts | Decision |
|---|---:|---|
| Shipping | 35 | 25 receipt status/provider-ID matches; retain remaining batch/planning artifacts for provenance review. No imports performed. |
| Historical preorder-delay campaign | 65 | Quarantine for campaign/provider-history reconciliation; destination Neon communication/audit history where business evidence, not automatic resends. |
| Preorder-delay previews | 6 | Retain pending distinction between test-send evidence and disposable previews. |
| Review-refund | 17 | Reconcile plans, invitations, send and delivery evidence against refund/outreach records. |
| Thank-you campaign | 3 | Reconcile local log/test evidence against shared campaign recipients; preserve test/live distinction. |
| Preorder announcement | 1 | Retain and classify test/provider receipt evidence. |
| Cart previews | 1 | Retain pending owner decision; preview is not proof of a send. |
| Incident/investigation/repair | 2 | Retain as provenance/audit evidence; do not replay stock changes. |

Private evidence is under `.local/migration/2026-11-19T07-00-24-862Z/`. Do not publish `audit.private.json` or Redis-error diagnostics.

## Refreshed baseline and triage — 19 November 2026

The preferred baseline is `.local/migration/2026-11-19T07-33-44-340Z/`, completed at `07:35:31Z`. It uses server `PEXPIRETIME` deadlines and bounded pipelining; it captured the same 1,777 keys/130 artifacts in approximately 107 seconds. All 1,777 logical values match the first capture, including the 19 originally flagged keys. No record was unstable on semantic/expiry checks. This still does not establish a cross-key point-in-time snapshot.

- Native Redis 8.8 recovery at `07:35:32Z` restored all 1,777 keys, checked all logical values/types/deadlines and verified all 130 local-file checksums.
- Source dumps total 510,082 bytes; the encrypted baseline is 698,752 bytes including compressed local artifacts. These are measured artifact sizes, **not provider storage/billing usage**.
- The encrypted per-key register covers all 1,777 keys: 928 environment-ambiguous keys plus one stock-correction marker are quarantined (929 total). Other discovered datasets have proposed Neon/Redis destinations. Nothing is approved for deletion.
- All 130 local artifacts have explicit decisions: 25 exact-shipping-receipt reconciliation cases, 28 planning/preview/audit artifacts retained, 3 artifacts with matching-provider provenance retained, 72 artifacts with local-only receipt evidence quarantined, and 2 with ambiguous workflow evidence quarantined.
- Receipt-object evidence across files: 156 matched provider-ID occurrences, 74 local-only provider-ID occurrences, and 25 ambiguous receipt-shaped objects. These are not unique messages and do not prove environment ownership or whether mail was sent.
- The handoff was extracted and restored again at `16:09:31Z`: **1,773 keys restored and 4 already expired keys correctly skipped**, with all 130 local-artifact checksums verified. The key was excluded; no upload or off-machine escrow occurred.
- Read-only Resend reconciliation of 74 unique UUID-shaped local-only receipt identifiers completed at `16:13:17Z`: 2 existing messages confirmed (HTTP 200), 72 unresolved (HTTP 404), no access/rate-limit block and **zero messages sent**. A 404 may reflect retention, account/key scope or a genuinely missing message; it is not proof of an unsent email. Those cases remain quarantined and must not become eligible to retry through migration.

The current local handoff, including encrypted provider evidence, is `.local/migration/handoff-1795104834379/encrypted-baseline-handoff.tar.gz`, SHA-256 `c9bbe890f62392ab1873b2a749eb3ec29a1221c941b8756675cea4f0e9e9075b`. Its extraction/checksum/recovery verification passed at `16:13:54Z`, again restoring 1,773 keys and skipping 4 expired keys. `handoff-verification.json` records the result. The encryption key is **not** in this package; no off-machine transfer occurred.

### Authenticated dashboard baseline

Measured at `2026-11-19T16:08:22Z` from a local macOS client against production; 16/16 GET requests succeeded and logout returned 200. At observation time, the dashboard reported 68 active and 156 completed orders. Project API reports serverless region `fra1` and configured regions `fra1/cdg1/lhr1/dub1/arn1`; observed response hints were `cpt1` for edge requests and `cdg1` for the sampled data requests. Region hints are not a complete execution trace.

| Request | Samples | Median total ms | Min–max ms |
|---|---:|---:|---:|
| Dashboard HTML shell | 3 | 16 | 15–24 |
| Active orders page 1 | 3 | 1,125 | 1,113–2,921 |
| Completed orders page 1 | 3 | 995 | 894–1,059 |
| Active orders page 2 | 3 | 862 | 797–1,097 |
| Order search, no match | 3 | 676 | 627–2,201 |
| Orders CSV export | 1 | 818 | 818 |

These are small sequential HTML/API/export samples, not browser render/LCP or controlled warm/cold measurements. Customer response bodies, passwords and session cookies were not persisted. The only authorised writes were the normal temporary admin session, login-rate counters and logout. Do not compare batched Redis pipeline latency directly with these API timings.

Run benchmarks only with separate normal-login approval: `npm run migration:benchmark -- --allow-admin-login`. Read-only provider reconciliation, when appropriate: `npm run migration:reconcile-provider -- .local/migration/<capture-directory> --read-resend`; it only GETs existing UUID-addressed Resend message metadata and stops on access/rate-limit errors.
