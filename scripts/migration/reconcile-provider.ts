/** Read-only Resend observations for local-only receipt evidence. Never retries a send. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { decryptArchive, encryptArchive, sha256 } from "./baseline";

type Triage = { kind: string; receipts?: { providerIds: string[]; evidence: string }[] };
export function localOnlyIds(rows: Triage[]) {
  return [...new Set(rows.flatMap(row => (row.receipts || []).filter(receipt => receipt.evidence.startsWith("local-only")).flatMap(receipt => receipt.providerIds)))]
    .filter(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id));
}

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (process.argv.length !== 4 || process.argv[3] !== "--read-resend" || !directory.startsWith(resolve(".local/migration") + "/")) throw new Error("Private baseline directory and --read-resend required");
  const token = process.env.RESEND_API_KEY;
  if (!token) throw new Error("Existing Resend read credential required");
  const key = await readFile(resolve(".local/migration/backup.key"));
  const rows: Triage[] = [];
  for await (const row of decryptArchive(resolve(directory, "triage.jsonl.gz.aes"), key)) rows.push(row as Triage);
  const ids = localOnlyIds(rows);
  const observations: { kind: string; providerId: string; observedAt: string; httpStatus: number; lastEvent?: string; createdAt?: string; recipientCount?: number; decision: string }[] = [];
  let accessBlocked = false;
  for (const id of ids) {
    const response = await fetch(`https://api.resend.com/emails/${id}`, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const observation = { kind: "provider-observation", providerId: id, observedAt: new Date().toISOString(), httpStatus: response.status,
      lastEvent: undefined as string | undefined, createdAt: undefined as string | undefined, recipientCount: undefined as number | undefined,
      decision: "quarantine unresolved provider evidence; absence/error is not proof of an unsent message" };
    if (response.ok) {
      const data = await response.json();
      if (data.id !== id) throw new Error("Provider identifier mismatch");
      observation.lastEvent = typeof data.last_event === "string" ? data.last_event : undefined;
      observation.createdAt = typeof data.created_at === "string" ? data.created_at : undefined;
      observation.recipientCount = Array.isArray(data.to) ? data.to.length : undefined;
      observation.decision = "provider confirms existing message; retain local-only communication history and never re-send as an import side effect";
      // Drop message content/recipients; no plaintext provider payload is written or logged.
    } else await response.body?.cancel();
    observations.push(observation);
    if ([401, 403, 429].includes(response.status)) { accessBlocked = true; break; }
    await delay(600); // respect the provider's request rate; this is not send retry logic
  }
  const archive = resolve(directory, "provider-reconciliation.jsonl.gz.aes");
  async function* records() {
    yield { kind: "provider-header", operation: "GET existing email metadata only", sideEffects: false };
    yield* observations;
    yield { kind: "provider-footer", candidates: ids.length, observed: observations.length, accessBlocked };
  }
  await encryptArchive(archive, key, records());
  let authenticatedRecords = 0;
  for await (const row of decryptArchive(archive, key)) { void row; authenticatedRecords++; }
  if (authenticatedRecords !== observations.length + 2) throw new Error("Provider evidence authentication failed");
  const statuses: Record<string, number> = {};
  for (const row of observations) statuses[String(row.httpStatus)] = (statuses[String(row.httpStatus)] || 0) + 1;
  const summary = { completedAt: new Date().toISOString(), candidates: ids.length, observed: observations.length, accessBlocked, httpStatuses: statuses,
    existingMessagesConfirmed: observations.filter(row => row.httpStatus === 200).length, unresolved: ids.length - observations.filter(row => row.httpStatus === 200).length,
    authenticatedEvidenceVerified: true, sentMessages: 0, archiveSha256: sha256(await readFile(archive)),
    caveat: "Confirms provider existence only, not full delivery, recipient ownership, environment ownership or complete shared persistence; no evidence authorises a retry" };
  await writeFile(resolve(directory, "provider-reconciliation-summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1]?.endsWith("reconcile-provider.ts")) main().catch(() => { console.error("Read-only provider reconciliation failed; no email sent and no provider payload logged."); process.exitCode = 1; });
