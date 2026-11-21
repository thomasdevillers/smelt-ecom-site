# Simple Neon setup

One project, one database, one login. No custom roles or staging projects.

## Already done

- You created the Neon project and saved `NEON_CONNECTION_STRING` privately in your local environment file.
- Connection verified and the initial review/custom-hat schema applied on 20 November 2026.
- The owner-approved **291-entity review/custom-hat bulk import is complete and SQL-verified**, with 142 minimal order-reference stubs and 291 import checkpoints. Both versioned schema migrations are applied (zero pending). The app still uses Redis; imported copies are not authoritative yet.

## Your remaining steps

1. **Recovery window confirmed:** you confirmed Neon is set to its 7-day maximum. Recovery testing is **deferred at your request**; no further troubleshooting is planned. The attempted test remains unverified, not passed. You separately accepted that risk for the completed bulk import; production cutover still requires a separate decision. See [recovery-test status](neon-redis-recovery-test.md). No recovery-window/settings change was made by the setup script.
2. **When deploying PostgreSQL-backed code later:** add `NEON_CONNECTION_STRING` to Vercel **Production only**. Never prefix it with `NEXT_PUBLIC_`, add it to previews, commit it or paste it in chat. There is no reason to change existing live deployment settings now.

Keep the current Redis, Blob, R2, Paystack and Resend settings unchanged. Do not copy production storage/provider credentials into previews. Local SQL tests require no connection string.

The current shared/default login has schema-owner permissions. This is the simplicity trade-off you chose; separate restricted roles can be added later if needed.

I handle schema migrations and import tooling. Customer-data imports and a production cutover are separate steps, not automatic consequences of adding the connection string.
