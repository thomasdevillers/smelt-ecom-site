# Development

## Setup

Use Node.js 22.16+ and the committed npm lockfile. Run `npm ci`, copy `.env.local.example`, and configure test services. Start with `npm run dev`; use `npm run dev -- --port 3100` if needed.

Do not copy production service credentials into a test environment. Paystack test keys alone do not isolate Redis, Blob, R2 or PostgreSQL. Some local operator scripts intentionally target production; they are separate from the development/test workflow.

The example environment file documents each integration. Optional features can remain disabled. Stock/checkout require Redis; payments require Paystack; mail requires Resend. Generate a 32-character admin credential with `npm run admin:setup`; the application requires at least 16 characters.

## Checks and formatting

- `npm run check`: lint, route generation/type-check, then Vitest.
- `npm run format`: format maintained source with Prettier.
- `npm run format:check`: CI formatting gate.
- `npm run build`: production compilation.
- `npm run build:test` then `npm run test:e2e`: production browser tests with provider credentials removed by `scripts/testing/serve.mjs`.
- `npm audit`: dependency advisory check. Scoped overrides patch the pinned Zod/esbuild transitive dependencies; review their necessity when upgrading Blob or Drizzle Kit.

Unit and PGlite tests run without service credentials. The browser suite mocks API boundaries and blocks off-origin network requests; it tests interaction and routing, not provider acceptance. Test builds replace `.next`, so rebuild normally before deploying that output.

## Integration testing

Inventory tests start an empty, Unix-socket-only local Redis process and execute the real Lua scripts. They never load `.env.local` or use service credentials. Set `RUN_INVENTORY_REDIS_TESTS=1` to opt in. Install `redis-server` and `redis-cli` on PATH, or set `REDIS_TEST_BIN_DIR` to their directory. Every test uses UUID-scoped keys; the process and scratch directory are removed afterward.

Recovery tests use the same local Redis executables and a temporary encryption key. Set `RUN_MIGRATION_LOCAL_REDIS_TESTS=1` to opt in. Synthetic tests use matching source/target versions; real production captures may require Redis 8.8.0 for their RDB format. Passing synthetic tests does not establish recoverability of production backups.

## Local housekeeping

- `.next/` and `tsconfig.tsbuildinfo` are regenerable. Delete them if generated route types conflict, then run type-check/build.
- `node_modules/` is installed tooling. Recreate with `npm ci` when needed.
- `.local/` is ignored by Git, deployment, lint and ordinary test discovery. It contains **retained records as well as scratch work**. Keep operational captures/receipts; delete disposable previews and downloaded tool builds only once their use is finished.
- Keep new throwaway experiments in `.local/scratch/`. Retained campaign/incident records belong under clearly named folders.
- Numbered duplicate files were found in both source and generated output. The cause is not established. Exclude the repository's generated folders from folder-sync/backup conflict merging and check the local sync client if duplicates recur.

Commit source and the lockfile, never generated output or secrets. Use `docs/archive/` for historical implementation notes; update the current docs rather than adding another competing overview.
