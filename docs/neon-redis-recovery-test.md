# Neon recovery test — 20 November 2026

Status: **deferred at the owner's request on 20 November 2026; stop further restore troubleshooting.** The operator reported completing the dashboard restore, but read-only verification found the supplied endpoint still exactly matched the simulated-loss state. Recovery is unverified, not passed. Deferring this exercise does not itself authorise customer imports, a production cutover or deletion of temporary branches.

Subsequently, the owner **separately and explicitly approved** the pending schema application and 291-entity bulk import, accepting unverified recovery. That import is completed and verified in the working database; see [import evidence](neon-redis-phase-3.md#owner-approved-neon-bulk-import--20-november-2026). No production read/write cutover or temporary-branch deletion was authorised. The working database is now populated, so its zero-row pre-test snapshot is historical evidence, not a current baseline for rerunning the old recovery verification.

The operator created a temporary **schema-only `recovery-test` branch** in the existing project. Its endpoint was checked against the working endpoint; its empty foundation schema matched the working schema before any writes. No additional project, production schema migration, customer import or application switch was performed.

## Completed

- Inserted **13 synthetic rows across all 12 foundation tables** in the recovery-test branch, preserving relationships, minor-unit money, invitation/claim state, a review photo reference, revision four, ranking retry state and submitted/unsubmitted artwork ownership.
- Captured per-table counts/checksums and column/constraint/index checksums. All fixture URLs/keys are fake; no provider file exists or was created for this test.
- Recorded the restore point **LSN `0/1A71E70`**, at **2026-11-20 07:18:50.223 UTC**.
- Then edited the synthetic review text and deleted one synthetic artwork-ownership row. The target now has **12 rows**, and its checksums differ from the original fixture, as expected.
- Verified the working database's rows and schema were unchanged. The source connection was read-only throughout. No Redis, email, payment, AI, Blob or R2 operation occurred.
- Private evidence: `.local/migration/neon-recovery-1795159130308/evidence.private.json` (owner-only). The local one-off operator script contains only synthetic values; neither script nor reports contain a connection string/password. Existing `.env.local` was not modified.

## Operator step — recovery-test only

**Verification at 2026-11-20 07:22:16 UTC:** schema and 10 table checksums match, but review text is still changed and `custom_files` still has one row instead of two. The full target snapshot exactly matches the recorded post-loss snapshot (12 rows). The working source remains unchanged. Private diagnostics: `.local/migration/neon-recovery-1795159130308/verification-failed-*.private.json`. No database writes or restore retries were performed during verification. Check the completed restore's target/status and the current `recovery-test` endpoint before retrying; the supplied endpoint may not be the restored target.

1. In Neon, select **`recovery-test`**. Check the target is **not** the production/working branch.
2. Open **Backup & Restore → Restore from history**, choosing **its own history**.
3. Select **LSN** and enter **`0/1A71E70`**. Review the target branch and confirm. Keep the automatically preserved pre-restore backup until verification.
4. Tell the agent when restoration finishes. The next step is a **read-only** comparison of all 12 tables and schema against the saved checksums, plus another check that the working source is unchanged.

Do not use reset-from-parent, restore production, switch the app, import customer records or delete provider files. A database connection cannot perform Neon's control-plane restore; the dashboard operation is still necessary. If Neon does not offer restore-from-history on this branch, stop and report what the dashboard shows rather than selecting production.

After successful verification, remove only the temporary test/backup branches after confirming their identities (or use their configured expiry); review any extra branch billing. Rotate the password exposed in chat using the correct branch/role controls. If that password is reused elsewhere, account for those connections too; no credential rotation was performed automatically.

This test can establish actual Neon point-in-time recovery of synthetic relational records and unchanged external-file references. It does **not** restore provider files, verify real customer links or replace the final import/cutover checks.
