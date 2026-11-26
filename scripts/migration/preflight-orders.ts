/** Operator-only READ-ONLY production preflight. Provider payloads/configuration
 * are encrypted locally; no schema, business record, deployment or env mutation. */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { databaseConfig } from "../../lib/db/config";
import { encryptArchive, privateDirectory, sha256 } from "./baseline";
import { capturePaystackOrders } from "./order-capture";
import { readReviewCustomSource } from "./review-custom-source";
import { planOrders } from "./order-plan";

async function main() {
  if (process.argv.slice(2).join(" ") !== "--read-only-production")
    throw new Error("Explicit read-only production preflight option required.");
  const directory = resolve(".local/migration", `phase5-preflight-${Date.now()}`);
  await privateDirectory(directory);
  const key = await readFile(resolve(".local/migration/backup.key"));
  if (key.length !== 32) throw new Error("Existing backup key required.");
  let token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_KEY;
  if (!token) {
    for (const path of [
      "Library/Application Support/com.vercel.cli/auth.json",
      ".local/share/com.vercel.cli/auth.json",
      ".config/com.vercel.cli/auth.json",
    ]) {
      try {
        token = JSON.parse(await readFile(resolve(homedir(), path), "utf8")).token;
        if (token) break;
      } catch {
        /* Try documented CLI credential locations only. */
      }
    }
  }
  if (!token) throw new Error("Existing Vercel login required.");
  const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
  const vercel = async (path: string) => {
    const response = await fetch(
      `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(project.orgId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`Vercel read failed (${response.status}).`);
    return response.json();
  };
  const [settings, variables] = await Promise.all([
    vercel(`/v9/projects/${project.projectId}`),
    vercel(`/v10/projects/${project.projectId}/env?decrypt=true&target=production`),
  ]);
  const production: Record<string, string> = {};
  const selected = new Set([
    "PAYSTACK_SECRET_KEY",
    "NEON_CONNECTION_STRING",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "ORDER_STORE",
    "ORDER_PAUSED",
    "PAYSTACK_EVENT_STORE",
    "PAYSTACK_EVENT_PAUSED",
    "REVIEW_CUSTOM_STORE",
    "REVIEW_CUSTOM_PAUSED",
  ]);
  for (const row of variables.envs ?? []) {
    if (
      !selected.has(row.key) ||
      !Array.isArray(row.target) ||
      !row.target.includes("production") ||
      row.type === "sensitive"
    )
      continue;
    const value =
      row.type === "encrypted"
        ? (await vercel(`/v1/projects/${project.projectId}/env/${row.id}`)).value
        : row.value;
    if (typeof value === "string" && value) production[row.key] = value;
  }
  // Sensitive Vercel values cannot be retrieved. A separately supplied live key
  // is allowed; the ordinary local PAYSTACK_SECRET_KEY is never substituted.
  if (process.env.PAYSTACK_LIVE_SECRET_KEY)
    production.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_LIVE_SECRET_KEY;
  if (!production.PAYSTACK_SECRET_KEY?.startsWith("sk_live_"))
    throw new Error(
      "A retrievable live production Paystack key is required; no test-key substitution.",
    );
  if (!production.UPSTASH_REDIS_REST_URL || !production.UPSTASH_REDIS_REST_TOKEN)
    throw new Error("Production Redis access is required.");
  await encryptArchive(
    resolve(directory, "production-config.jsonl.gz.aes"),
    key,
    (async function* () {
      yield { production, deployment: settings.targets?.production };
    })(),
  );
  const capture = await capturePaystackOrders(production.PAYSTACK_SECRET_KEY, "live");
  const providerArchive = resolve(directory, "paystack.jsonl.gz.aes");
  await encryptArchive(
    providerArchive,
    key,
    (async function* () {
      yield capture;
    })(),
  );
  await writeFile(
    resolve(directory, "paystack-summary.json"),
    JSON.stringify(
      {
        environment: "live",
        startedAt: capture.startedAt,
        completedAt: capture.completedAt,
        total: capture.total,
        archiveSha256: sha256(await readFile(providerArchive)),
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  const adjustments: Record<string, unknown[]> = {};
  for (const kind of ["refund", "dispute"]) {
    const rows: unknown[] = [];
    let expectedTotal: number | undefined;
    for (let page = 1; page <= 10000; page++) {
      const response = await fetch(`https://api.paystack.co/${kind}?perPage=100&page=${page}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${production.PAYSTACK_SECRET_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Paystack ${kind} read failed (${response.status}).`);
      const body = await response.json();
      if (
        body.status !== true ||
        !Array.isArray(body.data) ||
        !Number.isSafeInteger(body.meta?.pageCount) ||
        !Number.isSafeInteger(body.meta?.total)
      )
        throw new Error("Invalid adjustment pagination.");
      expectedTotal ??= body.meta.total;
      if (expectedTotal !== body.meta.total)
        throw new Error("Adjustment records changed during capture.");
      rows.push(...body.data);
      if (page >= body.meta.pageCount) {
        if (rows.length !== expectedTotal) throw new Error("Incomplete adjustment capture.");
        break;
      }
      if (!body.data.length || page === 10000) throw new Error("Incomplete adjustment pagination.");
    }
    adjustments[kind] = rows;
  }
  await encryptArchive(
    resolve(directory, "adjustments.jsonl.gz.aes"),
    key,
    (async function* () {
      yield adjustments;
    })(),
  );
  const child = spawnSync(
    process.execPath,
    [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/migration/capture.ts"],
    {
      env: {
        ...process.env,
        UPSTASH_REDIS_REST_URL: production.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: production.UPSTASH_REDIS_REST_TOKEN,
      },
      encoding: "utf8",
      timeout: 240_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (child.status !== 0) throw new Error("Read-only Redis capture failed.");
  const match = /Read-only baseline saved to (.+?)\. \d+ keys/.exec(child.stdout);
  if (!match) throw new Error("Redis capture location unavailable.");
  const redisDirectory = match[1],
    redis = await readReviewCustomSource(redisDirectory, key, /^smelt:(orders|shipping):/);
  // No ownership decisions inferred from matching customers/orders or the key mode.
  const plan = planOrders(capture, redis.snapshots, redis.archiveChecksum, {}, redis.localRecords);
  await encryptArchive(
    resolve(directory, "unresolved-order-plan.jsonl.gz.aes"),
    key,
    (async function* () {
      yield plan;
    })(),
  );
  await writeFile(
    resolve(directory, "unresolved.private.json"),
    JSON.stringify({ sources: plan.sources, rejected: plan.rejected }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  const neonSource = production.NEON_CONNECTION_STRING
    ? "production"
    : "operator-connection-identity-to-confirm";
  const config = databaseConfig(
    {
      NEON_CONNECTION_STRING:
        production.NEON_CONNECTION_STRING || process.env.NEON_CONNECTION_STRING,
    },
    "migration",
  );
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
    options: "-c default_transaction_read_only=on",
  });
  let database;
  try {
    const connection = await pool.connect();
    try {
      await connection.query("begin read only");
      const migrations = await connection.query(
        "select count(*)::int as applied from drizzle.__drizzle_migrations",
      );
      const orders = await connection.query(
        "select environment, count(*)::int as orders, count(amount_minor)::int as enriched from orders group by environment",
      );
      const extensions = await connection.query(
        "select name, installed_version from pg_available_extensions where name = 'pg_trgm'",
      );
      database = {
        source: neonSource,
        migrations: migrations.rows,
        orders: orders.rows,
        extensions: extensions.rows,
      };
      await connection.query("rollback");
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
  const reasons: Record<string, number> = {};
  for (const row of plan.rejected) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  const summary = {
    at: new Date().toISOString(),
    directory,
    redisDirectory,
    paymentMode: "live",
    transactions: capture.total,
    refunds: adjustments.refund.length,
    disputes: adjustments.dispute.length,
    plannedOrders: plan.orders.length,
    unresolved: reasons,
    shippingSourceKeys: redis.snapshots.filter((row) => row.key.startsWith("smelt:shipping:"))
      .length,
    localReceipts: redis.localRecords?.length ?? 0,
    configuration: {
      orderStore: production.ORDER_STORE || "redis",
      eventStore: production.PAYSTACK_EVENT_STORE || "legacy",
      reviewStore: production.REVIEW_CUSTOM_STORE || "redis",
    },
    deployment: {
      id: settings.targets?.production?.id,
      state: settings.targets?.production?.readyState,
      commit: settings.targets?.production?.meta?.githubCommitSha,
    },
    database,
  };
  await writeFile(resolve(directory, "summary.json"), JSON.stringify(summary, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      /^(Vercel read failed|Paystack (refund|dispute) read failed|A retrievable live production Paystack key)/.test(
        error.message,
      )
      ? error.message
      : "Read-only Phase 5 preflight stopped. No provider payloads or credentials logged; production was not changed.",
  );
  process.exitCode = 1;
});
