import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Source, classify, decryptArchive, encryptArchive, logicalValue, snapshot, snapshotMany } from "./baseline";
import { walk } from "./audit";
import { artifactDecision } from "./triage";
import { localOnlyIds } from "./reconcile-provider";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const dir of directories.splice(0)) await rm(dir, { recursive: true }); });

describe("Phase 1 safety", () => {
  it("never infers environment from IDs or payloads", () => {
    expect(classify("smelt:shipping:receipt:v1:live").environment).toBe("ambiguous");
    expect(classify("smelt:followup:v1:checkout:live").environment).toBe("ambiguous");
    expect(classify("smelt:orders:completed:v1:test").environment).toBe("test");
    expect(classify("smelt:ask-hat:conversations:v1:production:index").environment).toBe("production");
    expect(classify("smelt:reviews:v1:live:records").environment).toBe("live");
    expect(classify("unexpected:live").decision).toBe("quarantine");
    expect(classify("smelt:reviews:v2:live:records").decision).toBe("quarantine");
  });
  it("keeps locks/rate limits in Redis but not durable receipts or claims", () => {
    expect(classify("smelt:reviews:v1:live:ranking:lock:123").destination).toContain("Redis:");
    expect(classify("smelt:reviews:v1:live:claim:123").destination).toContain("Neon:");
    expect(classify("smelt:followup:v1:notice:123").destination).toContain("Neon:");
    expect(classify("smelt:customer-thank-you:v1:live:smelt100:attempts:date").destination).toContain("Neon:");
    expect(classify("smelt:inventory:v1:live:correction:historical-adjustment").decision).toBe("retain; quarantine adjustment provenance");
  });
  it("rejects source mutations before making an HTTP request", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const source = new Source("https://example.com", "secret");
    for (const command of ["SET", "DEL", "RESTORE", "EVAL", "KEYS", "FLUSHDB"]) await expect(source.batch([[command, "key"]])).rejects.toThrow("allowlisted");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("encrypts archives and authenticates before yielding any record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode/baseline-test-")); directories.push(dir);
    const file = join(dir, "archive.aes"), key = randomBytes(32);
    async function* records() { yield { kind: "header" }; yield { private: "customer@example.com", binary: "AAAB/w==" }; yield { kind: "footer" }; }
    await encryptArchive(file, key, records());
    expect((await readFile(file)).includes(Buffer.from("customer@example.com"))).toBe(false);
    const restored = [];
    for await (const row of decryptArchive(file, key)) restored.push(row);
    expect(restored).toHaveLength(3);
    let yielded = 0;
    const tag = await readFile(`${file}.tag`); tag[0] ^= 1; await writeFile(`${file}.tag`, tag);
    await expect((async () => { for await (const row of decryptArchive(file, key)) { void row; yielded++; } })()).rejects.toThrow();
    expect(yielded).toBe(0);
  });
  it("deduplicates incremental hash scans and preserves raw JSON strings", async () => {
    const command = vi.fn().mockResolvedValueOnce(["7", ["a", '{"status":"accepted"}']]).mockResolvedValueOnce(["0", ["a", '{"status":"accepted"}', "b", "2"]]);
    const value = await logicalValue({ command } as unknown as Source, "hash-key", "hash");
    expect(value).toEqual([["a", '{"status":"accepted"}'], ["b", "2"]]);
    expect(command.mock.calls[1][0]).toEqual(["HSCAN", "hash-key", "7", "COUNT", 100]);
  });
  it("records absolute expiry and flags concurrent changes", async () => {
    const expiry = Date.now() + 5000;
    const batch = vi.fn().mockResolvedValueOnce(["string", 5000, expiry]).mockResolvedValueOnce(["YQ=="]).mockResolvedValueOnce(["Yg==", expiry]);
    const command = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce("a");
    const row = await snapshot({ batch, command } as unknown as Source, "unknown");
    expect(row?.unstable).toBe(true);
    expect(Date.parse(row!.expiresAt!)).toBe(expiry);
  });
  it("walks JSON-encoded values without fetching file references", () => {
    const found: unknown[] = [];
    walk([["request", JSON.stringify({ submission: { fileKey: "custom-hats/live/unchanged.png" } })]], (value, path) => { if (path.endsWith(".fileKey")) found.push(value); });
    expect(found).toEqual(["custom-hats/live/unchanged.png"]);
  });
  it("flags TTL-only mutations even when the source value is unchanged", async () => {
    const batch = vi.fn().mockResolvedValueOnce(["string", -1, -1]).mockResolvedValueOnce(["YQ=="]).mockResolvedValueOnce(["YQ==", Date.now() + 5000]);
    const command = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce("a");
    const row = await snapshot({ batch, command } as unknown as Source, "unknown");
    expect(row?.unstable).toBe(true);
  });
  it("pipelines bounded captures and checks changed dump bytes semantically", async () => {
    const expiry = Date.now() + 5000;
    const batch = vi.fn().mockResolvedValueOnce(["string", "hash"])
      .mockResolvedValueOnce([5000, expiry, 1, -1, -1, 1])
      .mockResolvedValueOnce(["YQ==", "Yg=="])
      .mockResolvedValueOnce(["a"])
      .mockResolvedValueOnce(["YQ==", expiry, "Yw==", -1]);
    const command = vi.fn().mockResolvedValue(["0", ["field", "value"]]);
    const rows = await snapshotMany({ batch, command } as unknown as Source, ["string", "hash"]);
    expect(rows.map(row => row?.unstable)).toEqual([false, false]);
    expect(rows[0]?.expiresAt).toBe(new Date(expiry).toISOString());
    expect(command).toHaveBeenCalledTimes(2);
    await expect(snapshotMany({} as Source, Array(26).fill("key"))).rejects.toThrow("1–25");
  });
  it("retains local-only/ambiguous evidence without treating absence as an unsent message", () => {
    expect(artifactDecision(".local/campaign/log.json", 0, 1, 1)).toContain("quarantine local-only receipt evidence");
    expect(artifactDecision(".local/campaign/log.json", 0, 0, 1)).toContain("do not retry or assume unsent");
    expect(artifactDecision(".local/campaign/plan.json", 0, 0, 0)).toContain("no proof of a send");
    expect(artifactDecision(".local/shipping/receipts/fixture.json", 1, 0, 1)).toContain("exact shared email/waybill receipt");
  });
  it("bounds provider reconciliation to unique local-only UUID identifiers", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const rows = [{ kind: "local-triage", receipts: [{ providerIds: [id, id, "not-a-provider-id"], evidence: "local-only provider ID evidence" }, { providerIds: ["00000000-0000-4000-8000-000000000002"], evidence: "matching shared provider ID evidence" }] }];
    expect(localOnlyIds(rows)).toEqual([id]);
  });
});
