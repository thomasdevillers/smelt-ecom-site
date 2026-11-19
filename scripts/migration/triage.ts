/** Offline inventory decisions. No provider requests, sends, mutations or deletion. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classify, decryptArchive, encryptArchive, sha256, type Snapshot } from "./baseline";
import { walk } from "./audit";

const providerFields = ["id", "emailId", "resendId", "messageId", "resend_id"];
export function artifactDecision(path: string, receiptMatches: number, unmatchedReceipts: number, receiptObjects: number) {
  if (path.startsWith(".local/shipping/receipts/")) return "retain; reconcile against exact shared email/waybill receipt";
  if (unmatchedReceipts) return "quarantine local-only receipt evidence; preserve for Neon communication history; verify provider before any action";
  if (receiptMatches) return "retain provenance; matching provider IDs do not prove complete shared persistence";
  if (receiptObjects) return "quarantine ambiguous workflow evidence; do not retry or assume unsent";
  return "retain planning/preview/audit evidence; no proof of a send; owner retention decision required";
}

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (process.argv.length !== 3 || !directory.startsWith(resolve(".local/migration") + "/")) throw new Error("Private baseline directory required");
  const key = await readFile(resolve(".local/migration/backup.key"));
  const redis: Snapshot[] = [];
  const local: { kind: string; path: string; checksum: string; content: string }[] = [];
  const knownIds = new Set<string>();
  let footer: { keys: number; localFiles: number } | undefined;
  for await (const raw of decryptArchive(resolve(directory, "baseline.jsonl.gz.aes"), key)) {
    const row = raw as Snapshot;
    if (row.kind === "redis") redis.push(row);
    else if ((raw as { kind: string }).kind === "local") local.push(raw as typeof local[number]);
    else if ((raw as { kind: string }).kind === "footer") footer = raw as typeof footer;
  }
  if (!footer || footer.keys !== redis.length || footer.localFiles !== local.length) throw new Error("Incomplete baseline");
  for (const row of redis) walk(row.logical, value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    // Only receipt-shaped objects count; generic request/customer IDs are not provider evidence.
    if (!["accepted", "pending", "rejected", "sent", "delivered", "manual"].includes(String(record.status)) && !Object.hasOwn(record, "acceptedAt")) return;
    for (const field of providerFields) if (typeof record[field] === "string") knownIds.add(record[field] as string);
  });
  const counts: Record<string, number> = {};
  let localOnlyReceiptObjects = 0, matchedReceiptObjects = 0, ambiguousReceiptObjects = 0;
  const outcomes = local.map(file => {
    if (sha256(file.content) !== file.checksum) throw new Error("Local artifact checksum mismatch");
    let content: unknown;
    try { content = JSON.parse(file.content); } catch { content = null; }
    const receipts: { path: string; providerIds: string[]; evidence: string; status: unknown }[] = [];
    walk(content, (value, path) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const row = value as Record<string, unknown>;
      if (!["status", "acceptedAt", "attemptedAt", "emailId", "resendId"].some(field => Object.hasOwn(row, field))) return;
      const ids = providerFields.map(field => row[field]).filter((id): id is string => typeof id === "string" && !!id);
      const matches = ids.filter(id => knownIds.has(id));
      const evidence = !ids.length ? "ambiguous; no provider ID" : matches.length === ids.length ? "matching shared provider ID evidence" : "local-only provider ID evidence; not proof of an unsent message";
      receipts.push({ path, providerIds: ids, evidence, status: row.status ?? null });
    });
    const matched = receipts.filter(r => r.evidence.startsWith("matching")).length;
    const unmatched = receipts.filter(r => r.evidence.startsWith("local-only")).length;
    const ambiguous = receipts.length - matched - unmatched;
    matchedReceiptObjects += matched; localOnlyReceiptObjects += unmatched; ambiguousReceiptObjects += ambiguous;
    const decision = artifactDecision(file.path, matched, unmatched, receipts.length);
    counts[decision] = (counts[decision] || 0) + 1;
    return { kind: "local-triage", path: file.path, checksum: file.checksum, parseableJson: content !== null, decision, receipts };
  });
  const archive = resolve(directory, "triage.jsonl.gz.aes");
  let quarantinedKeys = 0;
  async function* records() {
    yield { kind: "triage-header", generatedAt: new Date().toISOString(), source: "baseline.jsonl.gz.aes", sideEffects: false };
    for (const row of redis) {
      const classification = classify(row.key);
      if (classification.decision.includes("quarantine")) quarantinedKeys++;
      yield { kind: "source-mapping", key: row.key, type: row.type, classification, sourceChecksum: row.checksum,
        expirationDecision: row.expiresAt ? "preserve original deadline; never reactivate expired workflow" : "retain until explicit retention approval",
        approval: "proposed destination only; not migration/deletion authorisation" };
      if (["inventory", "preorders", "coupons", "vouchers"].includes(classification.family)) yield { kind: "financial-baseline", key: row.key, type: row.type, value: row.logical,
        decision: "retain balances, allocations, adjustments and deduplication markers; no release/redemption/recalculation", amountUnits: "coupon/voucher amounts currently whole rand; preserve source before future minor-unit conversion" };
    }
    yield* outcomes;
    yield { kind: "triage-footer", mappedKeys: redis.length, localArtifacts: outcomes.length };
  }
  await encryptArchive(archive, key, records());
  let verifiedKeys = 0, verifiedLocal = 0, verifiedFooter = false;
  for await (const raw of decryptArchive(archive, key)) {
    const kind = (raw as { kind: string }).kind;
    if (kind === "source-mapping") verifiedKeys++;
    if (kind === "local-triage") verifiedLocal++;
    if (kind === "triage-footer") verifiedFooter = true;
  }
  if (!verifiedFooter || verifiedKeys !== redis.length || verifiedLocal !== local.length) throw new Error("Triage verification failed");
  const summary = { completedAt: new Date().toISOString(), mappedKeys: redis.length, quarantinedKeys, classifiedLocalArtifacts: local.length,
    matchedReceiptObjects, localOnlyReceiptObjects, ambiguousReceiptObjects, artifactDecisions: counts, authenticatedTriageVerified: true,
    caveats: ["Receipt objects may duplicate the same provider event across local files", "Local-only evidence means absent from captured shared receipt objects, not unsent", "Unknown environment ownership stays quarantined; no inferred relabelling", "No records imported, sent, deleted or made eligible to retry"], archiveSha256: sha256(await readFile(archive)) };
  await writeFile(resolve(directory, "triage-summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1]?.endsWith("triage.ts")) main().catch(() => { console.error("Offline triage failed; no customer data or provider payload logged."); process.exitCode = 1; });
