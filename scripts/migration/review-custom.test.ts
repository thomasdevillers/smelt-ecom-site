import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptArchive, sha256, type Snapshot } from "./baseline";
import { readReviewCustomSource, type ReviewCustomSource } from "./review-custom-source";
import { canonical, planReviewCustomImport, singlePublishedOnlyResolution } from "./review-custom-plan";
import { applyReviewCustomPlan, writeImportEntry } from "./review-custom-write";
import { compareReviewCustomPlans, verifyReviewCustomPlan } from "./review-custom-check";
import * as schema from "../../lib/db/schema";

const at = "2026-10-01T00:00:00.000Z", expiry = "2026-11-01T00:00:00.000Z";
const tokenDigest = sha256("existing-invitation-token"), token = "x".repeat(32);
const rp = "smelt:reviews:v1:live:", cp = "smelt:custom-hats:v1:live:";
const file = "custom-hats/live/request-one/unchanged.svg", inFlight = "custom-hats/live/request-one/pending.svg";
const review = { id: "review-one", productId: "smelt-sauna-hat", orderReference: "order-one", customerEmail: "", displayName: "Synthetic",
  anonymous: false, rating: 5, body: "Original body", colours: ["green"], photos: [{ url: "https://synthetic.private.blob.vercel-storage.com/reviews/pending/upload/file.jpg", pathname: "reviews/pending/upload/file.jpg" }],
  verifiedPurchase: true, status: "pending", submittedAt: at, publishedAt: null, consentVersion: "2026-09-17" };
const placement = { enabled: false, fileKey: null, fileName: null, fileType: null, notes: "" };
const design = { contact: { name: "Synthetic", company: "", email: "synthetic@example.invalid", phone: "" }, notes: "Original notes",
  hats: [{ id: "hat-one", colour: "green", quantity: 2, front: { ...placement, enabled: true, fileKey: file, fileName: "original.svg", fileType: "image/svg+xml" },
    back: placement, tag: { enabled: false, text: "" }, notes: "Original design" }] };
function snapshot(key: string, type: string, logical: unknown, expiresAt: string | null = null): Snapshot {
  const dump = Buffer.from("synthetic-dump");
  return { kind: "redis", key, type, logical, observedAt: at, expiresAt, pttl: expiresAt ? 1 : -1,
    dump: dump.toString("base64"), checksum: sha256(dump), cardinality: Array.isArray(logical) ? logical.length : 1,
    classification: { family: "reviews", environment: "live", destination: "Neon", decision: "retain" }, unstable: false };
}
function fixture(): ReviewCustomSource {
  return { archiveChecksum: "a".repeat(64), capturedAt: at, totalKeys: 14, snapshots: [
    snapshot(`${rp}records`, "hash", [[review.id, JSON.stringify(review)]]),
    snapshot(`${rp}status:pending`, "zset", [[review.id, String(Date.parse(at))]]),
    snapshot(`${rp}invite:${tokenDigest}`, "string", JSON.stringify({ reference: review.orderReference, email: "synthetic@example.invalid", suggestedName: "Synthetic", colours: ["green"], uploadKey: "upload", createdAt: at, expiresAt: expiry, photosRequired: false }), expiry),
    snapshot(`${rp}order:${sha256(review.orderReference)}:invite`, "string", tokenDigest, expiry),
    snapshot(`${rp}claim:${tokenDigest}`, "string", review.id),
    snapshot(`${rp}order:${sha256(review.orderReference)}:review`, "string", review.id),
    snapshot(`${rp}upload-paths:${tokenDigest}`, "set", [["reviews/pending/upload/reserved.jpg", true]], expiry),
    snapshot(`${rp}ranking:scores`, "hash", [[review.id, JSON.stringify({ usefulness: 5, specificity: 5, context: 5, clarity: 5, imageEvidence: 5, score: 52.5, reason: "Original reason", fingerprint: "original-fingerprint", rubricVersion: "original-rubric", model: "original-model", scoredAt: at })]]),
    snapshot(`${rp}ranking:retry:${review.id}`, "string", JSON.stringify({ fingerprint: "original-fingerprint", attempts: 2, nextAttemptAt: Date.parse(at) }), expiry),
    snapshot(`${rp}ranking:lock:${review.id}`, "string", "operational-lease", expiry),
    snapshot(`${cp}requests`, "hash", [["request-one", JSON.stringify({ id: "request-one", token, customer: { name: "Synthetic", email: "synthetic@example.invalid", phone: "" }, createdAt: at, submittedAt: at, revision: 4, submission: design })]]),
    snapshot(`${cp}token:${sha256(token)}`, "string", "request-one"),
    snapshot(`${cp}files:request-one`, "set", [[file, true], [inFlight, true]]),
  ] };
}
function duplicateFixture(): ReviewCustomSource {
  const source = fixture();
  source.snapshots.find(row => row.key === `${rp}records`)!.logical = [
    [review.id, { ...review, status: "published", publishedAt: at }],
    ["rejected-one", { ...review, id: "rejected-one", status: "rejected" }],
    ["rejected-two", { ...review, id: "rejected-two", status: "rejected" }],
  ];
  source.snapshots = source.snapshots.filter(row => row.key !== `${rp}status:pending`);
  source.snapshots.push(snapshot(`${rp}status:published`, "zset", [[review.id, String(Date.parse(at))]]),
    snapshot(`${rp}status:rejected`, "zset", [["rejected-one", String(Date.parse(at))], ["rejected-two", String(Date.parse(at))]]));
  const originalInvitation = source.snapshots.find(row => row.key === `${rp}invite:${tokenDigest}`)!;
  const scores = source.snapshots.find(row => row.key === `${rp}ranking:scores`)!.logical as [string, unknown][];
  for (const id of ["rejected-one", "rejected-two"]) {
    const digest = sha256(id);
    source.snapshots.push(snapshot(`${rp}invite:${digest}`, "string", originalInvitation.logical, expiry),
      snapshot(`${rp}claim:${digest}`, "string", id),
      snapshot(`${rp}ranking:retry:${id}`, "string", { fingerprint: "rejected-input", attempts: 1, nextAttemptAt: Date.parse(at) }, expiry));
    scores.push([id, scores[0][1]]);
  }
  // The original index points to a record now explicitly excluded. SQL must
  // rebuild uniqueness from the retained review, not follow this stale pointer.
  source.snapshots.find(row => row.key === `${rp}order:${sha256(review.orderReference)}:review`)!.logical = "rejected-two";
  return source;
}
const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const dir of directories.splice(0)) await rm(dir, { recursive: true }); });

describe("offline import planning", () => {
  it("compares captures without exposing values or treating archive changes as entity edits", () => {
    const before = planReviewCustomImport(fixture()), source = fixture();
    source.archiveChecksum = "b".repeat(64);
    source.capturedAt = "2026-10-02T00:00:00.000Z";
    const unchanged = compareReviewCustomPlans(before, planReviewCustomImport(source));
    expect(unchanged.counts).toEqual({ added: 0, changed: 0, removed: 0, unchanged: before.entries.length });
    source.snapshots.find(row => row.key === `${rp}records`)!.logical = [[review.id, { ...review, body: "Changed private text" }]];
    source.snapshots.find(row => row.key === `${cp}files:request-one`)!.logical = [[file, true], ["custom-hats/live/request-one/new-private-key.svg", true]];
    const result = compareReviewCustomPlans(before, planReviewCustomImport(source));
    expect(result.counts).toEqual({ added: 1, changed: 1, removed: 1, unchanged: before.entries.length - 2 });
    expect(JSON.stringify(result)).not.toContain("Changed private text");
    expect(JSON.stringify(result)).not.toContain("new-private-key");
    expect(compareReviewCustomPlans(before, planReviewCustomImport(source))).toEqual(result);
  });
  it("blocks older or quarantined comparison captures", () => {
    const before = planReviewCustomImport(fixture()), source = fixture();
    source.capturedAt = "2026-09-30T00:00:00.000Z";
    expect(() => compareReviewCustomPlans(before, planReviewCustomImport(source))).toThrow("predates");
    source.capturedAt = at;
    source.snapshots.push(snapshot(`${rp}unknown`, "string", "unknown"));
    expect(() => compareReviewCustomPlans(before, planReviewCustomImport(source))).toThrow("quarantined");
  });
  it("is deterministic and preserves records, deadlines, file keys, active tokens and original revision numbers", () => {
    const source = fixture(), before = canonical(source);
    const plan = planReviewCustomImport(source);
    expect(plan.rejected).toEqual([]);
    expect(plan.digest).toBe(planReviewCustomImport(fixture()).digest);
    expect(canonical(source)).toBe(before);
    expect(plan.entries.find(e => e.table === "reviews")?.values.record).toEqual(review);
    expect(plan.entries.find(e => e.table === "review_claims")?.values.claimed_at).toBeNull();
    expect(plan.entries.find(e => e.table === "review_invitations")?.values.expires_at).toBe(expiry);
    expect(plan.entries.find(e => e.table === "custom_requests")?.values.token).toBe(token);
    expect(plan.entries.filter(e => e.table === "custom_revisions")).toHaveLength(1);
    expect(plan.entries.find(e => e.table === "custom_revisions")?.values.revision).toBe(4);
    expect(plan.entries.filter(e => e.table === "custom_files").map(e => e.key.file_key).sort()).toEqual([inFlight, file].sort());
    expect(plan.sources.find(s => s.key.includes("ranking:lock"))?.decision).toBe("retain-redis");
  });
  it("quarantines every member of a duplicate order group rather than choosing a winner", () => {
    const source = fixture();
    source.snapshots.find(s => s.key.endsWith(":records"))!.logical = [[review.id, review], ["other-review", { ...review, id: "other-review", status: "rejected" }]];
    const plan = planReviewCustomImport(source);
    expect(plan.rejected.filter(r => r.reason === "duplicate-review-order")).toHaveLength(2);
    expect(plan.entries.filter(e => e.table === "reviews")).toHaveLength(0);
  });
  it("keeps only the published review for the exact approved group and excludes dependent records", () => {
    const source = duplicateFixture(), before = canonical(source);
    const plan = planReviewCustomImport(source, singlePublishedOnlyResolution(source));
    expect(plan.rejected).toEqual([]);
    expect(canonical(source)).toBe(before);
    expect(plan.entries.filter(e => e.table === "reviews").map(e => e.key.id)).toEqual([review.id]);
    expect(plan.excluded.filter(e => e.reason === "owner-approved-rejected-duplicate")).toHaveLength(2);
    expect(plan.entries.filter(e => e.table === "review_claims")).toHaveLength(1);
    expect(plan.entries.filter(e => e.table === "review_rankings")).toHaveLength(1);
    expect(plan.excluded.filter(e => e.reason === "owner-approved-excluded-review-claim")).toHaveLength(2);
    expect(plan.excluded.filter(e => e.reason === "owner-approved-excluded-review-ranking")).toHaveLength(4);
    expect(plan.entries.filter(e => e.table === "review_invitations").map(e => e.values.state).sort()).toEqual(["revoked", "revoked", "used"]);
    expect(plan.sources.find(s => s.key === `${rp}order:${sha256(review.orderReference)}:review`)?.decision).toBe("rebuilt-index");
    expect(planReviewCustomImport(source).rejected.length).toBeGreaterThan(0);
  });
  it("does not apply approval to a changed archive, status, ID or order", () => {
    const original = duplicateFixture(), resolution = singlePublishedOnlyResolution(original);
    for (const change of ["archive", "status", "id", "order"]) {
      const source = duplicateFixture();
      const records = source.snapshots.find(row => row.key === `${rp}records`)!.logical as [string, Record<string, unknown>][];
      if (change === "archive") source.archiveChecksum = "f".repeat(64);
      if (change === "status") records[1][1].status = "pending";
      if (change === "id") { records[1][0] = "different-review"; records[1][1].id = "different-review"; }
      if (change === "order") records[1][1].orderReference = "different-order";
      expect(planReviewCustomImport(source, resolution).rejected.some(row => row.reason.startsWith("approved-resolution"))).toBe(true);
    }
  });
  it("does not introduce a blanket duplicate policy or exclude unrelated rejected reviews", () => {
    const source = duplicateFixture();
    const records = source.snapshots.find(row => row.key === `${rp}records`)!.logical as [string, Record<string, unknown>][];
    records.push(["unrelated-rejected", { ...review, id: "unrelated-rejected", orderReference: "another-order", status: "rejected" }]);
    (source.snapshots.find(row => row.key === `${rp}status:rejected`)!.logical as [string, unknown][]).push(["unrelated-rejected", String(Date.parse(at))]);
    const plan = planReviewCustomImport(source, singlePublishedOnlyResolution(source));
    expect(plan.rejected).toEqual([]);
    expect(plan.entries.filter(e => e.table === "reviews").map(e => e.key.id).sort()).toEqual([review.id, "unrelated-rejected"].sort());
    const changed = duplicateFixture();
    const anotherPublished = (changed.snapshots.find(row => row.key === `${rp}records`)!.logical as [string, Record<string, unknown>][])[1][1];
    anotherPublished.status = "published"; anotherPublished.publishedAt = at;
    expect(() => singlePublishedOnlyResolution(changed)).toThrow("differs");
    expect(() => singlePublishedOnlyResolution(fixture())).toThrow("exactly one");
  });
  it("does not confuse unrelated edits in a containing Redis hash with a changed entity", () => {
    const first = planReviewCustomImport(fixture()), source = fixture();
    source.archiveChecksum = "b".repeat(64);
    source.snapshots.find(s => s.key.endsWith(":records"))!.checksum = "c".repeat(64);
    const second = planReviewCustomImport(source);
    expect(second.entries.find(e => e.table === "reviews")?.sourceHash).toBe(first.entries.find(e => e.table === "reviews")?.sourceHash);
    expect(second.digest).not.toBe(first.digest);
  });
  it("preserves a source TTL shorter than invitation validity and pointer revocation", () => {
    const source = fixture();
    source.snapshots = source.snapshots.filter(s => !s.key.startsWith(`${rp}claim:`));
    source.snapshots.find(s => s.key.startsWith(`${rp}invite:`))!.expiresAt = "2026-10-02T00:00:00.000Z";
    source.snapshots = source.snapshots.filter(s => !s.key.endsWith(":invite") || s.key.includes("invite:"));
    const plan = planReviewCustomImport(source), invitation = plan.entries.find(e => e.table === "review_invitations");
    expect(invitation?.values.state).toBe("revoked");
    expect(invitation?.values.expires_at).toBe("2026-10-02T00:00:00.000Z");
    expect((invitation?.values.payload as Record<string, unknown>).expiresAt).toBe(expiry);
  });
  it("quarantines unknown namespaces/suffixes, unstable records and orphan ownership", () => {
    const source = fixture();
    source.snapshots.push(snapshot("smelt:reviews:v1:production:records", "hash", []), snapshot(`${rp}unexpected`, "string", "unknown"), snapshot(`${cp}files:missing`, "set", [[inFlight, true]]));
    source.snapshots.find(s => s.key.startsWith(`${rp}upload-paths:`))!.unstable = true;
    const plan = planReviewCustomImport(source);
    expect(plan.rejected.map(r => r.reason)).toEqual(expect.arrayContaining(["unknown-namespace", "unknown-source-suffix", "orphan-custom-ownership", "unstable-source"]));
  });
  it("rejects submitted artwork with missing ownership instead of silently adopting a file", () => {
    const source = fixture();
    source.snapshots.find(s => s.key === `${cp}files:request-one`)!.logical = [[inFlight, true]];
    const plan = planReviewCustomImport(source);
    expect(plan.rejected.some(r => r.reason === "missing-file-ownership")).toBe(true);
    expect(plan.entries.some(e => e.table === "custom_requests")).toBe(false);
  });
  it("rejects unknown invitation consent/options and preserves publication state", () => {
    const source = fixture();
    const row = source.snapshots.find(s => s.key.startsWith(`${rp}invite:`))!;
    const value = JSON.parse(String(row.logical)); value.photosRequired = "true"; row.logical = JSON.stringify(value);
    expect(planReviewCustomImport(source).rejected.some(r => r.reason === "invalid-invitation")).toBe(true);
    expect(planReviewCustomImport(fixture()).entries.find(e => e.table === "reviews")?.values.status).toBe("pending");
  });
});

describe("authenticated archive input", () => {
  async function archive(badFooter = false) {
    const directory = await mkdtemp(join(tmpdir(), "opencode/review-import-")); directories.push(directory);
    const key = randomBytes(32), source = fixture(), file = join(directory, "baseline.jsonl.gz.aes");
    async function* records() {
      yield { kind: "header", version: 1, startedAt: at };
      yield* source.snapshots;
      yield { kind: "local", content: "synthetic-local-evidence", checksum: sha256("synthetic-local-evidence") };
      yield { kind: "footer", keys: source.snapshots.length + (badFooter ? 1 : 0), localFiles: 1 };
    }
    await encryptArchive(file, key, records());
    await writeFile(join(directory, "summary.json"), JSON.stringify({ archiveSha256: sha256(await readFile(file)) }));
    return { directory, file, key };
  }
  it("reads a complete encrypted archive and verifies counts and checksums without provider requests", async () => {
    const { directory, key } = await archive(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const source = await readReviewCustomSource(directory, key);
    expect(source.snapshots).toHaveLength(fixture().snapshots.length);
    expect(planReviewCustomImport(source).rejected).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects tampered authentication and incomplete footer counts", async () => {
    const { directory, file, key } = await archive();
    const tag = await readFile(`${file}.tag`); tag[0] ^= 1; await writeFile(`${file}.tag`, tag);
    await expect(readReviewCustomSource(directory, key)).rejects.toThrow();
    const incomplete = await archive(true);
    await expect(readReviewCustomSource(incomplete.directory, incomplete.key)).rejects.toThrow("counts");
  });
});

describe("resumable insert-only import in isolated PostgreSQL", () => {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  const plan = planReviewCustomImport(fixture());
  beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); }, 30_000);
  afterAll(async () => { await pg.close(); });
  it("commits each checkpoint with its record and safely resumes after interruption", async () => {
    let interruption = true;
    await expect(applyReviewCustomPlan(db, plan, async () => { if (interruption) { interruption = false; throw new Error("synthetic interruption"); } })).rejects.toThrow("checkpointed");
    expect(await db.select().from(schema.migrationImports)).toHaveLength(1);
    const result = await applyReviewCustomPlan(db, plan);
    expect(result.checkpointed).toBe(1);
    expect(result.inserted).toBe(plan.entries.length - 1);
    expect(await db.select().from(schema.migrationImports)).toHaveLength(plan.entries.length);
    expect((await db.select().from(schema.customRequests))[0].token).toBe(token);
    expect(await db.select().from(schema.customFiles)).toHaveLength(2);
  });
  it("verifies payloads, file ownership and counts in a read-only snapshot, not just checkpoints", async () => {
    const result = await verifyReviewCustomPlan(db, plan);
    expect(result.valid).toBe(true);
    expect(result.counts).toEqual({ matched: plan.entries.length, missing: 0, changed: 0, unexpected: 0 });
    expect(result.checksums.every(row => row.expectedChecksum === row.actualChecksum)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(file);
    expect(await db.select().from(schema.migrationImports)).toHaveLength(plan.entries.length);
  });
  it("does not overwrite newer records or resurrect a deleted record on rerun", async () => {
    await db.update(schema.reviews).set({ record: { ...review, body: "Newer edit" } as unknown as typeof schema.reviews.$inferSelect.record });
    await db.delete(schema.customFiles).where(eq(schema.customFiles.fileKey, inFlight));
    const result = await applyReviewCustomPlan(db, plan);
    expect(result.checkpointed).toBe(plan.entries.length);
    expect((await db.select().from(schema.reviews))[0].record.body).toBe("Newer edit");
    expect(await db.select().from(schema.customFiles)).toHaveLength(1);
  });
  it("detects edits and deletions even when reruns skip their checkpoints", async () => {
    const result = await verifyReviewCustomPlan(db, plan);
    expect(result.valid).toBe(false);
    expect(result.counts.changed).toBe(1);
    expect(result.counts.missing).toBe(1);
    expect(result.counts.unexpected).toBe(0);
    expect(result.checksums.filter(row => row.expectedChecksum !== row.actualChecksum).map(row => row.table).sort()).toEqual(["custom_files", "reviews"]);
    expect((await db.select().from(schema.reviews))[0].record.body).toBe("Newer edit");
    expect(await db.select().from(schema.customFiles)).toHaveLength(1);
  });
  it("detects unexpected rows in an otherwise empty destination table/environment", async () => {
    await db.insert(schema.environments).values({ id: "test", paymentMode: "test" });
    await db.insert(schema.customRequests).values({ environment: "test", id: "unexpected", tokenDigest: sha256("unexpected"), customer: {}, createdAt: at, revision: 0 });
    try {
      const result = await verifyReviewCustomPlan(db, plan);
      expect(result.valid).toBe(false);
      expect(result.counts.unexpected).toBe(1);
      expect(result.outcomes.filter(row => row.outcome === "unexpected")[0].id).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await db.delete(schema.customRequests).where(eq(schema.customRequests.id, "unexpected"));
    }
  });
  it("stops changed sources and rolls back conflicting entries without losing checkpoints", async () => {
    const entry = plan.entries.find(e => e.table === "reviews")!;
    await expect(writeImportEntry(db, { ...entry, sourceHash: "f".repeat(64) }, plan.archiveChecksum)).rejects.toThrow("reconciliation");
    expect(await db.select().from(schema.migrationImports)).toHaveLength(plan.entries.length);
  });
  it("matches an identical pre-existing record without replacing it or its newer order snapshot", async () => {
    const entry = plan.entries.find(e => e.table === "reviews")!;
    await db.delete(schema.migrationImports).where(eq(schema.migrationImports.id, entry.id));
    await db.update(schema.reviews).set({ record: review as unknown as typeof schema.reviews.$inferSelect.record });
    await db.update(schema.orders).set({ paymentStatus: "success", amountMinor: 78000, currency: "ZAR", snapshot: { originalPrice: 39000 } });
    expect(await writeImportEntry(db, entry, plan.archiveChecksum)).toBe("matched");
    expect((await db.select().from(schema.orders))[0].paymentStatus).toBe("success");
    expect((await db.select().from(schema.orders))[0].amountMinor).toBe(78000);
  });
  it("rejects destination differences before checkpointing rather than overwriting them", async () => {
    const entry = plan.entries.find(e => e.table === "reviews")!;
    await db.delete(schema.migrationImports).where(eq(schema.migrationImports.id, entry.id));
    await db.update(schema.reviews).set({ record: { ...review, body: "Destination changed" } as unknown as typeof schema.reviews.$inferSelect.record });
    await expect(writeImportEntry(db, entry, plan.archiveChecksum)).rejects.toThrow("reconciliation");
    expect(await db.select().from(schema.migrationImports).where(eq(schema.migrationImports.id, entry.id))).toHaveLength(0);
  });
  it("blocks an entire quarantined plan before inserting anything", async () => {
    const source = fixture(); source.snapshots.push(snapshot(`${rp}unknown`, "string", "unrecognised"));
    const before = (await db.select().from(schema.migrationImports)).length;
    await expect(applyReviewCustomPlan(db, planReviewCustomImport(source))).rejects.toThrow("quarantined");
    expect(await db.select().from(schema.migrationImports)).toHaveLength(before);
  });
  it("imports and resumes the approved published-only plan without inserting excluded IDs or claims", async () => {
    const isolated = new PGlite(), isolatedDb = drizzle(isolated, { schema });
    try {
      await migrate(isolatedDb, { migrationsFolder: "./drizzle" });
      const source = duplicateFixture(), approved = planReviewCustomImport(source, singlePublishedOnlyResolution(source));
      await applyReviewCustomPlan(isolatedDb, approved);
      expect((await isolatedDb.select().from(schema.reviews)).map(row => row.id)).toEqual([review.id]);
      expect((await isolatedDb.select().from(schema.reviewClaims)).map(row => row.reviewId)).toEqual([review.id]);
      expect((await isolatedDb.select().from(schema.reviewRankings)).map(row => row.reviewId)).toEqual([review.id]);
      expect((await isolatedDb.select().from(schema.reviewInvitations)).map(row => row.state).sort()).toEqual(["revoked", "revoked", "used"]);
      expect((await applyReviewCustomPlan(isolatedDb, approved)).checkpointed).toBe(approved.entries.length);
    } finally { await isolated.close(); }
  });
});
