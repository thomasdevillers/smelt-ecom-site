import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { databaseConfig } from "../../lib/db/config";
import * as schema from "../../lib/db/schema";
import { decryptArchive, encryptArchive, privateDirectory, sha256 } from "./baseline";
import { readReviewCustomSource } from "./review-custom-source";
import { planOrders, type PaystackCapture, type OrderPlan } from "./order-plan";
import { applyOrderPlan, reconcileOrderPlans, verifyOrderPlan } from "./order-write";
import { canonical } from "./review-custom-plan";

function privatePath(value: string | undefined) {
  const path = resolve(value ?? "");
  if (!path.startsWith(resolve(".local/migration") + "/")) throw new Error("Private migration path required.");
  return path;
}
async function main() {
  const [redisArg, providerArg, ownershipArg, ...args] = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--verify"].includes(arg) && !/^--plan=[a-f0-9]{64}$/.test(arg) && !arg.startsWith("--reconcile-from="))
    || (args.includes("--apply") && args.includes("--verify"))) throw new Error("Unsupported import options.");
  const redisDirectory = privatePath(redisArg), providerDirectory = privatePath(providerArg), ownershipPath = privatePath(ownershipArg);
  const key = await readFile(resolve(".local/migration/backup.key"));
  const redis = await readReviewCustomSource(redisDirectory, key, /^smelt:(orders|shipping):/);
  const providerFile = resolve(providerDirectory, "paystack.jsonl.gz.aes");
  const summary = JSON.parse(await readFile(resolve(providerDirectory, "paystack-summary.json"), "utf8"));
  if (summary.archiveSha256 !== sha256(await readFile(providerFile))) throw new Error("Paystack checksum mismatch.");
  const records: unknown[] = [];
  for await (const record of decryptArchive(providerFile, key)) records.push(record);
  if (records.length !== 1) throw new Error("Invalid provider archive.");
  const ownership = JSON.parse(await readFile(ownershipPath, "utf8"));
  if (!ownership || typeof ownership !== "object" || Array.isArray(ownership)
    || Object.entries(ownership).some(([key, value]) => !/^(smelt:shipping:|\.local\/shipping\/receipts\/)/.test(key) || !["live", "test"].includes(String(value)))) throw new Error("Invalid explicit shipping ownership map.");
  const plan = planOrders(records[0] as PaystackCapture, redis.snapshots, redis.archiveChecksum, ownership, redis.localRecords);
  const output = resolve(redisDirectory, `orders-${Date.now()}`);
  await privateDirectory(output);
  await encryptArchive(resolve(output, "planned-orders.jsonl.gz.aes"), key, (async function* () { yield plan; })());
  // No customer/provider payloads in reports. Source IDs still remain private.
  const report = { plan: plan.digest, archiveChecksum: plan.archiveChecksum, providerChecksum: plan.providerChecksum,
    environment: plan.environment, orders: plan.orders.length, shipments: plan.shipments.length, quarantined: plan.rejected.length };
  await writeFile(resolve(output, "plan.private.json"), JSON.stringify({ ...report, sources: plan.sources, rejected: plan.rejected }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(report));
  if (!args.includes("--apply") && !args.includes("--verify")) {
    console.log("Offline dry run only; no database/provider connections or messages."); return;
  }
  if (plan.rejected.length || !args.includes(`--plan=${plan.digest}`)) throw new Error("Resolve quarantines and supply the reviewed plan digest.");
  let baseline: OrderPlan | undefined;
  const reconcile = args.filter(arg => arg.startsWith("--reconcile-from="));
  if (reconcile.length > 1 || (reconcile.length && !args.includes("--apply"))) throw new Error("Reconciliation requires apply and one baseline.");
  if (reconcile.length) {
    if (process.env.ORDER_PAUSED !== "true" || process.env.PAYSTACK_EVENT_PAUSED !== "true") throw new Error("Final reconciliation requires paused domain and payment workers.");
    const records: OrderPlan[] = [];
    for await (const row of decryptArchive(resolve(privatePath(reconcile[0].slice("--reconcile-from=".length)), "planned-orders.jsonl.gz.aes"), key)) records.push(row as OrderPlan);
    if (records.length !== 1 || records[0].digest !== sha256(canonical({ ...records[0], digest: undefined }))) throw new Error("Invalid baseline plan.");
    baseline = records[0];
  }
  const config = databaseConfig(process.env, "migration");
  const pool = new Pool({ connectionString: config.connectionString, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
  try {
    const db = drizzle(pool, { schema });
    if (args.includes("--verify")) {
      const result = await verifyOrderPlan(db, plan);
      await writeFile(resolve(output, "verification.private.json"), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ valid: result.valid, orders: result.orders, shipments: result.shipments, amountMinor: result.amountMinor, mismatches: result.mismatches.length }));
      if (!result.valid) process.exitCode = 1;
    } else {
      const outcomes = resolve(output, "outcomes.private.jsonl");
      await writeFile(outcomes, "", { flag: "wx", mode: 0o600 });
      const report = async (row: unknown) => { await appendFile(outcomes, JSON.stringify(row) + "\n"); };
      console.log(JSON.stringify(baseline ? await reconcileOrderPlans(db, baseline, plan, report) : await applyOrderPlan(db, plan, report)));
    }
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Order import stopped. Inspect private reports and source/schema evidence; no payloads or credentials logged."); process.exitCode = 1; });
