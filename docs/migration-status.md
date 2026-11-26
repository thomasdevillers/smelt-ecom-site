# Storage migration status

Last source-document consolidation: **26 November 2026**. Production has not been reconfigured or independently re-queried during this repository cleanup.

## Latest recorded state

| Domain | Recorded authority | Evidence |
| --- | --- | --- |
| Reviews/custom designs | Neon; `REVIEW_CUSTOM_STORE=postgres` | [21 November cutover](archive/migration/neon-redis-cutover.md) |
| Orders/completion/shipping | Paystack + Redis; `ORDER_STORE` unset/default `redis` | [23 November status](archive/migration/neon-redis-phase-5.md) |
| Payment event processing | Legacy; `PAYSTACK_EVENT_STORE` unset/default `legacy` | Same status |
| Research | Neon schema applied; latest document says application deployment outstanding | Same status |
| Inventory, locks, sessions, notification receipts | Redis | Existing runtime paths |
| Review/custom files | Blob / R2 respectively | Existing runtime paths |

Six SQL migrations are recorded as applied. Order tables and durable-event code existing in the repository do **not** mean orders have been cut over. Review/design production recovery remains unverified in the recorded evidence.

## Outstanding production work

1. Confirm actual deployed commit and current store switches.
2. Complete production backup/restore verification and shipping-record ownership decisions.
3. Take fresh captures, import/reconcile orders, and resolve quarantined/mismatched records.
4. Drain writers and perform the documented paused order/event cutover.
5. Verify payment ingestion, order search/pagination, shipping, and notification behavior against providers.
6. Retire obsolete Redis business adapters and switches only after reconciliation and the retention window. Redis operational state remains necessary.

These steps cannot be replaced by deleting legacy files or flipping defaults. This cleanup retains working adapters and migration tooling. The Postgres order path already performs database pagination; the Redis dashboard path still loads provider history and remains a scaling limitation until cutover.

## References

- [Detailed order cutover and backfill procedure](archive/migration/neon-redis-phase-5.md)
- [Review/design rollback rules](archive/migration/neon-redis-cutover.md)
- [Recovery history](archive/migration/neon-redis-recovery-test.md)
- [Original multi-phase plan](archive/migration/neon-redis-migration.md)

Archived documents preserve historical observations, not current deployment instructions. Start with this page and update it when a production milestone actually completes.
