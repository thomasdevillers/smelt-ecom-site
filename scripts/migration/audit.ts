import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decryptArchive, sha256, type Snapshot } from "./baseline";

export function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function walk(value: unknown, visit: (value: unknown, path: string) => void, path = "$", depth = 0) {
  if (depth > 30) throw new Error("Nested record exceeds audit limit");
  const decoded = parse(value);
  visit(decoded, path);
  if (Array.isArray(decoded)) decoded.forEach((item, i) => walk(item, visit, `${path}[${i}]`, depth + 1));
  else if (decoded && typeof decoded === "object") for (const [key, item] of Object.entries(decoded)) walk(item, visit, `${path}.${key}`, depth + 1);
}

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (process.argv.length !== 3 || !directory.startsWith(resolve(".local/migration") + "/")) throw new Error("Pass a private baseline directory under .local/migration");
  const key = await readFile(resolve(".local/migration/backup.key"));
  const redis = new Map<string, Snapshot>();
  const local: { path: string; content: string }[] = [];
  let footer = false;
  for await (const raw of decryptArchive(resolve(directory, "baseline.jsonl.gz.aes"), key)) {
    const row = raw as Snapshot & { path: string; content: string };
    if (row.kind === "redis") redis.set(row.key, row);
    else if ((raw as { kind: string }).kind === "local") local.push(row);
    else if ((raw as { kind: string }).kind === "footer") footer = true;
  }
  if (!footer) throw new Error("Incomplete archive");
  const references: { sourceKey: string; path: string; reference: string; kind: string }[] = [];
  const workflows: { sourceKey: string; path: string; record: unknown }[] = [];
  const sharedIds = new Set<string>();
  const statuses: Record<string, number> = {};
  const schemas: Record<string, number> = {};
  for (const row of redis.values()) {
    // Group structural suffixes without exposing emails, UUIDs, digests or file keys.
    const pattern = row.key.split(":").map(part => /^[a-f0-9]{32,}$/i.test(part) || part.length > 30 || part.includes("@") ? "{id}" : /^\d{4}-\d\d-\d\d$/.test(part) ? "{date}" : part).join(":");
    schemas[pattern] = (schemas[pattern] || 0) + 1;
    walk(row.logical, (value, path) => {
      if (typeof value === "string" && (/^https:\/\/[^/]*\.blob\.vercel-storage\.com\//.test(value) || value.startsWith("custom-hats/"))) {
        references.push({ sourceKey: row.key, path, reference: value, kind: value.startsWith("custom-hats/") ? "R2 key" : "Vercel Blob URL" });
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        for (const name of ["id", "emailId", "resendId", "idempotencyKey"]) if (typeof record[name] === "string") sharedIds.add(`${name}:${record[name]}`);
        if (typeof record.status === "string") statuses[record.status] = (statuses[record.status] || 0) + 1;
        if (["status", "idempotencyKey", "heldBy", "redeemedBy", "green", "preorderGreen", "amount", "maxUses", "consent", "marketingConsent", "startedAt", "delivered"].some(name => Object.hasOwn(record, name))) workflows.push({ sourceKey: row.key, path, record });
      }
    });
  }
  const localAudit = local.map(file => {
    let shipping: { result: string; sharedKey: string; reason?: string } | undefined;
    let providerIdentifiers = 0, matchedIdentifiers = 0;
    let parsed: unknown;
    try { parsed = JSON.parse(file.content); } catch { parsed = null; }
    if (file.path.startsWith(".local/shipping/receipts/") && parsed && typeof parsed === "object") {
      const row = parsed as Record<string, unknown>;
      if (typeof row.email === "string" && typeof row.trackingNumber === "string") {
        const sharedKey = `smelt:shipping:receipt:v1:${sha256(`${row.email.toLowerCase()}\n${row.trackingNumber}`)}`;
        const shared = parse(redis.get(sharedKey)?.logical) as Record<string, unknown> | undefined;
        shipping = { sharedKey, result: !shared ? "missing shared receipt" : shared.status === row.status && shared.id === row.id ? "matching receipt status and provider ID" : "conflict; manual review required" };
      } else shipping = { sharedKey: "", result: "invalid local shipping receipt; quarantine" };
    }
    walk(parsed, value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const row = value as Record<string, unknown>;
      for (const name of ["id", "emailId", "resendId", "idempotencyKey"]) if (typeof row[name] === "string") {
        providerIdentifiers++;
        if (sharedIds.has(`${name}:${row[name]}`)) matchedIdentifiers++;
      }
    });
    return { path: file.path, sha256: sha256(file.content), shipping, providerIdentifiers, matchedIdentifiers,
      decision: shipping?.result || "quarantine local artifact; identifier matches are candidates, not proof of full shared persistence", parseableJson: parsed !== null };
  });
  const ownershipIssues: { requestKey: string; requestId: string; fileKey: string }[] = [];
  for (const row of redis.values()) {
    if (!/^smelt:custom-hats:v1:(live|test):requests$/.test(row.key) || !Array.isArray(row.logical)) continue;
    for (const [id, value] of row.logical as [string, string][]) {
      const owned = redis.get(row.key.replace(/:requests$/, `:files:${id}`));
      const members = new Set(Array.isArray(owned?.logical) ? owned.logical.map((pair: [string, unknown]) => pair[0]) : []);
      walk(value, (item, path) => {
        if (path.endsWith(".fileKey") && typeof item === "string" && item && !members.has(item)) ownershipIssues.push({ requestKey: row.key, requestId: id, fileKey: item });
      });
    }
  }
  const shippingResults: Record<string, number> = {};
  for (const file of localAudit) if (file.shipping) shippingResults[file.shipping.result] = (shippingResults[file.shipping.result] || 0) + 1;
  const report = {
    generatedAt: new Date().toISOString(), redisKeys: redis.size, localFiles: local.length, schemas,
    references, workflows, statuses, localAudit, ownershipIssues,
    summary: { fileReferenceOccurrences: references.length, r2ReferenceOccurrences: references.filter(r => r.kind === "R2 key").length,
      blobReferenceOccurrences: references.filter(r => r.kind === "Vercel Blob URL").length, ownershipIssues: ownershipIssues.length,
      workflowObjects: workflows.length, shippingResults, localArtifactsRequiringReview: localAudit.filter(f => !f.shipping || f.shipping.result !== "matching receipt status and provider ID").length },
    caveats: ["No files fetched, copied, signed, deleted or reorganised", "Reference occurrences are not unique file counts", "Ownership audit checks submitted R2 file keys against reservation sets, not physical file existence", "Provider IDs/statuses are preserved in encrypted source records; local candidates need manual reconciliation", "Unparseable and unrecognised artifacts remain quarantined"],
  };
  // Contains customer data and active links: never copy this report into docs or chat.
  await writeFile(resolve(directory, "audit.private.json"), JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ redisKeys: redis.size, localFiles: local.length, ...report.summary }, null, 2));
}
if (process.argv[1]?.endsWith("audit.ts")) main().catch(() => { console.error("Private audit failed; no source data logged."); process.exitCode = 1; });
