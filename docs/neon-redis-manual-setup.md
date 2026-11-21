# Simple Neon setup

One project, one database, one login. No custom roles or staging projects.

## Already done

- You created the Neon project and saved `NEON_CONNECTION_STRING` privately in your local environment file.
- Connection verified and the initial review/custom-hat schema applied on 20 November 2026.
- The owner-approved review/custom-hat copy was bulk-imported (291 entities), finally reconciled and SQL-verified (**293 entities**) under the cutover pause. Both migrations are applied. **Review/custom-design reads and writes are now live on Neon**; other domains and operational state remain on Redis. See [cutover/rollback log](neon-redis-cutover.md).

## Your remaining steps

1. **Recovery window confirmed:** you confirmed Neon is set to its 7-day maximum. Recovery testing is **deferred at your request**; no further troubleshooting is planned. The attempted test remains unverified, not passed. You separately accepted that risk for both the bulk import and the completed production cutover. See [recovery-test status](neon-redis-recovery-test.md). No recovery-window/settings change was made by the setup script.
2. **Production configured:** `NEON_CONNECTION_STRING` is now a sensitive Vercel **Production-only** variable, with `REVIEW_CUSTOM_STORE=postgres` and `REVIEW_CUSTOM_PAUSED=false`. The operator's private local store/pause settings match. No preview target or `NEXT_PUBLIC_` database variable was added, and no connection secret was committed.

Keep the current Redis, Blob, R2, Paystack and Resend settings unchanged. Do not copy production storage/provider credentials into previews. Local SQL tests require no connection string.

The current shared/default login has schema-owner permissions. This is the simplicity trade-off you chose; separate restricted roles can be added later if needed.

I handle schema migrations and import tooling. Customer-data imports and a production cutover are separate steps, not automatic consequences of adding the connection string.
