import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Source, encryptArchive, localRecords, privateDirectory, sha256, snapshotMany, type Snapshot } from "./baseline";

async function main() {
  if (process.argv.length > 2) throw new Error("No arguments supported; configure source through environment variables");
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis credentials required");
  const root = resolve(".local/migration");
  await privateDirectory(root);
  const directory = resolve(root, new Date().toISOString().replace(/[:.]/g, "-"));
  await privateDirectory(directory);
  const keyFile = resolve(root, "backup.key");
  let encryptionKey: Buffer;
  try { encryptionKey = await readFile(keyFile); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    encryptionKey = randomBytes(32);
    await writeFile(keyFile, encryptionKey, { flag: "wx", mode: 0o600 });
  }
  if (encryptionKey.length !== 32) throw new Error("Invalid backup key");
  const source = new Source(url, token);
  const startedAt = new Date().toISOString();
  const before = await source.command(["DBSIZE"]);
  const groups: Record<string, { keys: number; entriesOrBytes: number; expiring: number; persistent: number; unstable: number; minTtlMs: number | null; maxTtlMs: number | null }> = {};
  const seen = new Set<string>();
  let vanished = 0, localFiles = 0;
  async function* records() {
    yield { kind: "header", version: 1, startedAt, sourceFingerprint: sha256(url!), consistency: "online incremental scan; not point-in-time; no writes, no external file operations" };
    let cursor = "0";
    do {
      const [next, keys] = await source.command(["SCAN", cursor, "COUNT", 100]) as [string, string[]];
      cursor = String(next);
      // Bound concurrency and provider load; SCAN duplicates are deliberately deduplicated.
      for (let index = 0; index < keys.length; index += 25) {
        const batch = keys.slice(index, index + 25).filter(key => { if (seen.has(key)) return false; seen.add(key); return true; });
        if (!batch.length) continue;
        const rows = await snapshotMany(source, batch);
        for (const row of rows) {
          if (!row) { vanished++; continue; }
          const id = [row.classification.family, row.classification.environment, row.type, row.classification.destination].join(" | ");
          const group = groups[id] ||= { keys: 0, entriesOrBytes: 0, expiring: 0, persistent: 0, unstable: 0, minTtlMs: null, maxTtlMs: null };
          group.keys++; group.entriesOrBytes += row.cardinality;
          if (row.pttl >= 0) {
            group.expiring++;
            group.minTtlMs = Math.min(group.minTtlMs ?? Infinity, row.pttl);
            group.maxTtlMs = Math.max(group.maxTtlMs ?? 0, row.pttl);
          } else group.persistent++;
          if (row.unstable) group.unstable++;
          yield row satisfies Snapshot;
        }
      }
    } while (cursor !== "0");
    for await (const row of localRecords()) { localFiles++; yield row; }
    yield { kind: "footer", keys: seen.size - vanished, vanished, localFiles, completedAt: new Date().toISOString() };
  }
  const archive = resolve(directory, "baseline.jsonl.gz.aes");
  await encryptArchive(archive, encryptionKey, records());
  const durations = source.durations.sort((a, b) => a - b);
  const report = {
    startedAt, completedAt: new Date().toISOString(), sourceFingerprint: sha256(url),
    dbsizeBefore: before, dbsizeAfter: await source.command(["DBSIZE"]), scannedUnique: seen.size, vanished, localFiles,
    sourceCommands: source.requests, pipelineLatencyMs: { p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.floor(durations.length * .95)] },
    archiveSha256: sha256(await readFile(archive)), groups,
    caveats: ["Online scan is not a consistent point-in-time backup", "Unstable keys require recapture under domain pause", "TTL absolute deadlines preserved; expired records must not be resurrected", "Archive and .tag require separately escrowed backup.key", "REST latency is not dashboard latency or service billing/storage usage"],
  };
  await writeFile(resolve(directory, "summary.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Read-only baseline saved to ${directory}. ${seen.size - vanished} keys and ${localFiles} private local files encrypted. No customer data printed.`);
}
main().catch(() => { console.error("Baseline capture failed; partial archives are not valid backups. No provider payload or credentials logged."); process.exitCode = 1; });
