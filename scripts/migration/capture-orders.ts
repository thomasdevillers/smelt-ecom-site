import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encryptArchive, privateDirectory, sha256 } from "./baseline";
import { capturePaystackOrders } from "./order-capture";

async function main() {
  const [directoryArg, mode, ...extra] = process.argv.slice(2);
  const directory = resolve(directoryArg ?? "");
  if (!directory.startsWith(resolve(".local/migration") + "/") || !["live", "test"].includes(mode) || extra.length)
    throw new Error("Private output directory and explicit live/test environment required.");
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") throw new Error("Provider capture is disabled in previews.");
  const key = await readFile(resolve(".local/migration/backup.key"));
  if (key.length !== 32) throw new Error("Existing backup key required.");
  const capture = await capturePaystackOrders(process.env.PAYSTACK_SECRET_KEY ?? "", mode as "live" | "test");
  await privateDirectory(directory);
  const file = resolve(directory, "paystack.jsonl.gz.aes");
  await encryptArchive(file, key, (async function* () { yield capture; })());
  const summary = { environment: capture.environment, startedAt: capture.startedAt, completedAt: capture.completedAt,
    total: capture.total, archiveSha256: sha256(await readFile(file)) };
  await writeFile(resolve(directory, "paystack-summary.json"), JSON.stringify(summary, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(summary));
}
main().catch(() => { console.error("Paystack capture stopped; no payloads or credentials logged. Use a new output directory to retry."); process.exitCode = 1; });
