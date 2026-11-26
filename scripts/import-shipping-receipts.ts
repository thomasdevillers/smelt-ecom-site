/** One-time, idempotent import of local send history. Never sends emails. */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adminStore, digest } from "../lib/admin/store";
import { historyKey, shipmentKey } from "../lib/admin/orders";
import type { ShippingReceipt } from "../lib/admin/types";
import { assertOrdersWritable, orderStore, sqlOrders } from "../lib/orderPersistence";
import { paystackEnvironment } from "../lib/payments/paystackEventConfig";

const IMPORT_RECEIPT = `
local prior = redis.call('GET', KEYS[1])
if not prior then redis.call('SET', KEYS[1], ARGV[1]); prior = ARGV[1] end
redis.call('HSET', KEYS[2], ARGV[2], prior)
return 1`;
async function main() {
  const apply = process.argv.includes("--apply");
  const dir = resolve(".local/shipping/receipts");
  const rows: ShippingReceipt[] = [];
  const sqlMode = orderStore() === "postgres";
  const ownershipArg = process.argv.find((arg) => arg.startsWith("--ownership="));
  const ownership =
    sqlMode && ownershipArg
      ? JSON.parse(await readFile(resolve(ownershipArg.slice("--ownership=".length)), "utf8"))
      : null;
  if (sqlMode && (!ownership || typeof ownership !== "object" || Array.isArray(ownership)))
    throw new Error(
      "SQL local-receipt import requires --ownership=<private per-filename live/test map>.",
    );
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    if (sqlMode && ownership[file] !== paystackEnvironment())
      throw new Error(
        "Every local receipt needs explicit matching environment ownership; split mixed batches before import.",
      );
    const row = JSON.parse(await readFile(resolve(dir, file), "utf8"));
    if (
      typeof row.email !== "string" ||
      !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(row.email) ||
      typeof row.trackingNumber !== "string" ||
      !/^\d{6,30}$/.test(row.trackingNumber)
    )
      throw new Error(`Invalid receipt: ${file}`);
    const startedAt = Date.parse(row.acceptedAt || row.attemptedAt);
    if (
      !Number.isFinite(startedAt) ||
      !["accepted", "pending"].includes(row.status) ||
      (row.status === "accepted" && !row.id)
    )
      throw new Error(`Invalid receipt: ${file}`);
    rows.push({
      status: row.status,
      email: row.email.toLowerCase(),
      trackingNumber: row.trackingNumber,
      startedAt,
      acceptedAt: row.acceptedAt,
      id: row.id,
      source: "manual",
    });
  }
  console.log(
    `${rows.length} local receipts validated (${rows.filter((r) => r.status === "pending").length} unresolved).`,
  );
  if (!apply) {
    console.log("Preview only. Add --apply to import into shared storage. No emails will be sent.");
    return;
  }
  assertOrdersWritable();
  if (orderStore() === "postgres") {
    const domain = await sqlOrders();
    for (const row of rows) await domain.importShipping(row);
    console.log(`Imported ${rows.length} local receipts into SQL. No emails sent.`);
    return;
  }
  const db = adminStore();
  for (const row of rows)
    await db.eval(
      IMPORT_RECEIPT,
      [shipmentKey(row.email, row.trackingNumber), historyKey(row.email)],
      [JSON.stringify(row), digest(`${row.email}\n${row.trackingNumber}`)],
    );
  console.log(
    `Imported ${rows.length} receipts. Existing shared receipts preserved. No emails sent.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
