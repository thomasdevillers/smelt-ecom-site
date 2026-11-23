# Phase 5 — order records and fulfilment

## Handoff — 22 November 2026

**Implementation and local validation are ready to commit. Production cutover is not complete.** The owner asked to stop at a commit/push point and continue later. No Phase 5 migration, import, deployment, environment change, payment action or email send has been performed against production.

The owner approved a **read-only production preflight**. Its results are below. Shipping ownership decisions, schema/import approval, a drained cutover window and production acceptance checks remain gates. Do not interpret the read-only approval as permission to apply changes.

Current production:

- Orders, completion dates and shipping still use Paystack/Redis; payment processing remains `legacy`.
- Review/custom-design paths remain on Neon under the earlier Phase 4 cutover.
- Deployment observed during preflight: `dpl_WL138KyDkG1p1GqgVYoNq3W5zDHL`, ready, commit `11ca0d574846604d95789ec64c38e010cd2b1895`.
- The operator Neon connection reports **two applied migrations** and **142 live order-reference stubs**, none enriched with payment amounts. Production's Neon variable is sensitive/non-retrievable, so this connection's identity must still be confirmed against the production project before writes.
- PostgreSQL offers `pg_trgm`; it is not installed yet. Migration `0004` installs it.

## Implemented locally

### Schema and safe backfill

- `0002_order_fulfilment_backfill.sql`: provider IDs, payment/observation dates, historical line-item prices (nullable when unknown), payment observations, shipments and exact source aliases.
- `0003_paystack_durable_inbox.sql`: durable deliveries, automatic-attempt guards and known-reference reconciliation scheduling.
- `0004_order_runtime_and_reconciliation.sql`: customer observations, searchable order projections and indexes, refund/dispute records, provider scan checkpoints and event-resolution evidence.
- `migration:capture-orders` reads all Paystack transaction pages/statuses and encrypts the result using the existing backup key. Capture checks explicit mode, unique references, stable totals and complete counts.
- `migration:orders` defaults to an offline plan. It consumes authenticated Redis/Paystack archives and explicit per-source shipping ownership decisions. Local shipping receipt files from the encrypted Redis baseline are included; their original evidence/checksums are retained with the shipment.
- Money remains integer minor units with currency. Original payloads/descriptions/quantities are preserved. Unknown historical prices/customer creation dates remain null. Customer identities come from provider IDs, not invented email-derived identities.
- An email/waybill receipt can remain unlinked to an order. Accepted manual receipts later aliased to orders retain their original payload and exact hashed source aliases. No relation is invented from an email match.
- All unknown, unstable, expiring, conflicting or unresolved source records are quarantined. Any quarantine blocks import. Imports have no notification, stock, voucher, payment or file-provider effects.
- Each order/items/observation/checkpoint group commits together. Reruns resume without overwriting newer records or recreating deleted records. An untouched Phase 4 stub can be enriched.
- Read-only verification compares provider amounts/statuses, fulfilment dates, order projections, items, observations, shipment payloads and aliases; it also flags unexpected enriched orders/shipments.
- Every plan is retained encrypted. An explicit paused reconciliation can compare an earlier imported plan with a fresh capture and apply changes only when old checkpoint hashes **and exact old contents** still match. It is resumable and retains original observations. Removed business records or accepted→pending shipment changes are not silently applied.

### One order/fulfilment authority

```dotenv
ORDER_STORE=redis
ORDER_PAUSED=false
PAYSTACK_EVENT_STORE=legacy
PAYSTACK_EVENT_PAUSED=false
```

- `ORDER_STORE=postgres` selects SQL reads **and** writes together and requires durable payment ingestion. Invalid configuration and hosted previews fail closed. SQL failure never falls back to Redis.
- Admin search, active/completed/preorder filters, totals and stable pagination run in SQL. Search has a GIN trigram index; payment/date/email/completion/reconciliation paths have B-tree indexes. CSV and customer-email lookup read local SQL orders.
- Current preorder allocation overrides remain authoritative in Redis until Phase 7. A read-only bulk allocation snapshot is applied inside SQL **before** counts/filtering/pagination, so historical provider metadata does not incorrectly restore already-fulfilled preorder quantities.
- Sensitive actions retain fresh Paystack verification. Completion requires an accepted shipment. Repeated completion/manual-review-message actions retain the original timestamps.
- Review invitation/outreach paths use the selected completion store. An order pause also blocks review outreach/invitation mutations dependent on fulfilment.
- Dashboard and CLI shipping use the same SQL reservation/acceptance/history adapter. It preserves the frozen first message, original retry start, provider ID and existing `shipping-<digest>` idempotency key. Expired/ambiguous receipts remain manual-review cases. Public DTOs omit messages and private local evidence.
- The shipping CLI cannot bypass SQL via its standalone provider fallback when SQL is selected. The local-receipt import CLI requires an explicit private per-filename ownership map in SQL mode.
- `ORDER_PAUSED=true` blocks fulfilment mutations and payment workers. Durable ingestion remains open. Pause settings are process/deployment scoped: running work and old deployments still need draining.

### Durable payments and shared entry points

- `PAYSTACK_EVENT_STORE=postgres` authenticates the original webhook body and commits the delivery before acknowledging it. Exact retries deduplicate by environment/body digest. Persistence failure returns 503 with no volatile fallback.
- Checkout GET/POST verification and purchase-reservation expiry enqueue successful, freshly verified provider data into the same inbox. In this mode they do not independently commit stock/vouchers or send notifications. Each delivery records whether it came from a webhook, verification or discovery.
- The worker uses bounded batches, row locks, fencing tokens, five-minute leases and durable backoff. Ten failed verification attempts become a manual-review case.
- Each payment is freshly verified before processing. Database-clock request timestamps fence older observations; order updates retain fulfilment dates and immutable payment observations. This orders requests, not provider-issued payment versions.
- Delayed successes cannot initiate purchase effects when current verification reports failure/reversal. Delayed failures after success cannot send failure emails. Pending states retry; identity/mode/amount discrepancies are held.
- A per-reference SQL automatic-attempt guard commits **before** calling the existing inventory/voucher/notification handler. Different payloads for that reference share the guard. Ambiguous external results or persistence failures are held rather than blindly replayed. Backfilled orders and historical successes cannot generate historical purchase notifications/actions.
- Existing confirmation receipts and inventory/voucher ledgers remain in Redis for Phases 6/7. The SQL attempt guard is not a full per-recipient outbox. Partial/ambiguous external attempts require reconciliation; a provider call cannot commit atomically with SQL. The cutover decision must accept this conservative manual-review behavior.
- Legacy failure emails lack durable receipt semantics, so the SQL worker holds confirmed failures for review instead of automatically sending them.

### Provider reconciliation and operations

- `/api/cron/paystack-events`: every minute, guarded event processing.
- `/api/cron/paystack-reconcile`: hourly, up to 25 due known references, including Phase 4 stubs. Failures rotate their next-check time without fabricating a new payment observation.
- `/api/cron/paystack-discovery`: every ten minutes, checkpointed transaction/refund/dispute sweeps with a fixed upper creation-date boundary per sweep. Each page and its cursor commit together; full sweeps repeat to revisit old status changes. Recently discovered successes enter the same guarded inbox; historical backfills do not schedule emails.
- All three cron routes require `CRON_SECRET`, are no-ops in legacy mode, respect worker/order pauses and return aggregate results rather than provider payloads.
- Refund/dispute webhook handling fetches current provider details. Original adjustment amounts/statuses are stored separately from the original paid total; a partial refund does not rewrite revenue or falsely label the whole payment reversed. Exact provider transaction IDs can resolve adjustments found before their order. Missing/invalid ownership is held for review.
- Refund/dispute flags block fulfilment and purchase effects. Flags are conservative and are not silently cleared because a transaction still says `success` or a dispute now says `resolved`; inspect the provider outcome before any further action. This phase does not initiate refunds or resolve disputes at Paystack.
- Authenticated `/api/admin/payment-events` provides paginated event state/reasons and provider-scan checkpoints without raw payloads. Same-origin, authenticated PATCH supports `acknowledge` or `retry-verification` with retained reconciliation evidence. It cannot delete/reset an external-attempt guard, extend receipt deadlines or automatically reissue an accepted action.
- Provider field/pagination mapping was checked against Paystack's public OpenAPI repository: `PaystackOSS/openapi`, `src/assets/openapi/paths/{refund,dispute}.yaml` and corresponding response schemas. The docs website returned 403, so the public specification was used.

## Read-only production preflight results

Approved read-only capture completed **22 November 2026, 13:37 UTC**:

| Source | Result |
|---|---:|
| Live Paystack transactions | 327 |
| Successful / reversed | 226 / 9 |
| Abandoned / failed | 85 / 7 |
| Refunds / disputes | 10 / 0 |
| Completion dates / manual review-message dates | 164 / 133 |
| Redis shipping source keys | 464 |
| Private local shipping receipt files | 25 |
| Distinct shipping email/waybill pairs | 164 |
| Conflicting shipment aliases | 0 |

Private evidence (not committed):

- `.local/migration/phase5-preflight-1795354547147/`: encrypted live Paystack capture, refund/dispute capture, selected production configuration, unresolved plan and offline ownership assessment; aggregate `summary.json` and `ownership-assessment-summary.json`.
- `.local/migration/2026-11-22T13-35-52-306Z/`: encrypted Redis/local-artifact baseline and summary.
- `.local/migration/phase5-assess.ts`: offline assessment only; it performs no source/destination writes.

The plan correctly quarantines **489 sources** until shipping ownership is explicitly resolved. Offline evidence groups the 164 shipment pairs into **139 with explicit references present in the live capture** and **25 with email-only matches**. There are no unmatched references or conflicting aliases in this capture. A hypothetical all-live ownership map produces 327 orders and 164 shipments with no further rejects, but **that is not an approved ownership decision and has not been applied**. Do not infer environment merely from an email/reference match or the active payment key.

Vercel's sensitive production Paystack/Neon variables cannot be retrieved. The initial local Paystack key was test-mode; the owner separately supplied `PAYSTACK_LIVE_SECRET_KEY` privately for this read-only capture. Ordinary local payment mode was not changed. The Neon query used the operator connection in a read-only session; confirm its production identity before applying anything.

These are online captures, not a final paused snapshot. They will need refreshing when the migration resumes.

## Resume here

1. Commit/review the implementation, tests and this handoff; keep `.env*`, `.local`, captures, keys and provider payloads out of commits. No commit or push was performed as part of this handoff.
2. Obtain explicit shipping ownership decisions for the source keys/local receipt paths, including the 25 email-only/manual shipment pairs. Retain the reviewed private ownership map. Confirm the Neon connection belongs to the intended production project.
3. Refresh read-only sources if necessary. The repeatable preflight command is:

   ```sh
   npm run migration:preflight-orders -- --read-only-production
   ```

   It uses existing Vercel access and the separately supplied live Paystack key, writes encrypted local evidence and issues only GET/read-only database operations. It never deploys, changes configuration, applies schema or imports records.

4. Run an offline plan with the approved map (map entries are exact Redis source keys or `.local/shipping/receipts/...` paths mapped to `live`/`test`):

   ```sh
   npm run migration:orders -- <private-redis-capture-directory> <private-paystack-capture-directory> <private-ownership-map.json>
   ```

   All paths must be under `.local/migration/`. Review its digest and private rejection report; zero unexplained quarantines are required. Each report directory includes encrypted `planned-orders.jsonl.gz.aes` for later reconciliation.

5. Obtain the **separate schema/import/cutover decision**, including the existing unverified-recovery limitation and conservative external-attempt handling. Then apply pending migrations using the Phase 2 runbook. Bulk import requires appending `--apply --plan=<reviewed-digest>`; schema setup is never automatic. Verify with `--verify --plan=<reviewed-digest>`.
6. For the cutover, drain fulfilment/shipping/status-refresh writers, manual scripts, review invitation/outreach work, callbacks and payment/expiry workers on old deployments. Use the new code with the domain paused. Preserve inbound payment events: once the inbox schema exists, enable SQL ingestion with workers paused; drain old synchronous callbacks/handlers before treating the boundary as frozen. Do not interrupt payments already in flight or restart receipt windows.
7. Capture final Redis/Paystack state, approve its digest, and reconcile with:

   ```sh
   ORDER_PAUSED=true PAYSTACK_EVENT_PAUSED=true npm run migration:orders -- <final-redis-directory> <final-paystack-directory> <ownership-map.json> --apply --plan=<final-digest> --reconcile-from=<previous-private-plan-report-directory>
   ```

   Each update checks the prior checkpoint and exact old contents. Unexpected newer writes and removed business records stop reconciliation; retain evidence and resolve them explicitly. Run read-only verification of the final plan. Reconcile refund/dispute evidence and validate pending/ambiguous external attempts before resume.
8. While paused, select `ORDER_STORE=postgres` and `PAYSTACK_EVENT_STORE=postgres` across the application and operator tools. Verify order counts/currency-status totals, dates, customer/order links, receipt provider IDs/history, CSV/search/filter/page totals, review eligibility and unchanged Phase 4 behavior. Confirm cron authentication and source/destination drift monitoring.
9. Resume only after the cutover gates pass. Monitor event ages/manual cases, discovery checkpoints, database errors and dashboard latency. Retain old Redis business keys read-only; no key/file/provider cleanup is authorised.

**Rollback:** before SQL application writes or inbox acknowledgements, retain the paused new code and verify authority before returning to legacy. After SQL accepts writes/events, freeze processing and reconcile/roll forward. Do not promote an old deployment or flip stores blindly: that can strand acknowledged events, bypass guards, lose fulfilment changes or resend messages. Recovery remains unverified under the earlier documented limitation; this phase has not claimed a tested production restore.

## Validation at the handoff

- **880 tests passed, 32 skipped**. Coverage includes source quarantine/ownership, local receipt evidence, resumable imports/final reconciliation, newer-write protection, SQL shipping concurrency and receipt windows, callback routing, webhook authentication/acknowledgement, duplicates/out-of-order events, lease loss, provider acceptance followed by persistence failure, discovery/refunds/disputes and manual resolutions.
- SQL search-plan check selects the trigram index on a **5,000-row synthetic dataset** after index maintenance/analysis. This is not a production latency measurement.
- Clean, credential-free **production build passed**, including TypeScript and all routes, in an isolated temporary copy. No `.env`, `.local`, Vercel configuration or existing generated output was copied.
- Source TypeScript check passed. The ordinary workspace still has four pre-existing duplicate generated `.next/types` declarations; none were deleted to obtain a pass.
- ESLint passed for all **49 changed source/test files**; `git diff --check` passed. Secrets and private preflight evidence remain outside the commit set.
- Tests use disposable in-memory PostgreSQL and mocked providers. The separately authorised preflight used read-only production access; no real-provider write-lifecycle acceptance or production migration/cutover has been claimed.
