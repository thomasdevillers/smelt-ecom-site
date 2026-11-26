/** Offline archive reader. No Redis, PostgreSQL or provider connections. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decryptArchive, sha256, type Snapshot } from "./baseline";

export interface ReviewCustomSource {
  archiveChecksum: string;
  capturedAt: string;
  snapshots: Snapshot[];
  totalKeys: number;
  localRecords?: { path: string; content: string; checksum: string }[];
}

export async function readReviewCustomSource(
  directory: string,
  key: Buffer,
  families = /^smelt:(reviews|custom-hats):/,
): Promise<ReviewCustomSource> {
  const archive = resolve(directory, "baseline.jsonl.gz.aes");
  const archiveChecksum = sha256(await readFile(archive));
  const summary = JSON.parse(await readFile(resolve(directory, "summary.json"), "utf8"));
  if (summary.archiveSha256 !== archiveChecksum) throw new Error("Archive checksum mismatch.");
  const snapshots: Snapshot[] = [];
  const localRecords: NonNullable<ReviewCustomSource["localRecords"]> = [];
  const seen = new Set<string>();
  let capturedAt: string | undefined,
    keys = 0,
    localFiles = 0,
    complete = false;
  for await (const raw of decryptArchive(archive, key)) {
    if (!raw || typeof raw !== "object" || complete) throw new Error("Invalid archive sequence.");
    const row = raw as Record<string, unknown>;
    if (!capturedAt) {
      if (
        row.kind !== "header" ||
        row.version !== 1 ||
        typeof row.startedAt !== "string" ||
        !Number.isFinite(Date.parse(row.startedAt))
      )
        throw new Error("Invalid archive header.");
      capturedAt = row.startedAt;
    } else if (row.kind === "redis") {
      const snapshot = raw as Snapshot;
      if (
        typeof snapshot.key !== "string" ||
        seen.has(snapshot.key) ||
        typeof snapshot.dump !== "string" ||
        sha256(Buffer.from(snapshot.dump, "base64")) !== snapshot.checksum
      )
        throw new Error("Invalid/duplicate source checksum.");
      seen.add(snapshot.key);
      keys++;
      if (families.test(snapshot.key)) snapshots.push(snapshot);
    } else if (row.kind === "local") {
      if (typeof row.content !== "string" || sha256(row.content) !== row.checksum)
        throw new Error("Invalid local evidence checksum.");
      if (typeof row.path === "string" && row.path.startsWith(".local/shipping/receipts/"))
        localRecords.push({ path: row.path, content: row.content, checksum: String(row.checksum) });
      localFiles++;
    } else if (row.kind === "footer") {
      if (row.keys !== keys || row.localFiles !== localFiles)
        throw new Error("Incomplete archive counts.");
      complete = true;
    } else throw new Error("Unexpected archive record.");
  }
  if (!capturedAt || !complete) throw new Error("Incomplete archive.");
  return { archiveChecksum, capturedAt, snapshots, totalKeys: keys, localRecords };
}
