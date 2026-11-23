import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import { reviewDomain } from "./review-domain";
import { customHatDomain } from "./custom-hat-domain";
import { reviewCustomStore } from "../reviewCustomPersistence";
import { cleanupReviewTemporaryState } from "../reviewCustomMaintenance";
import { digest } from "../admin/store";
import { createReviewInvitation, createReviewInvitationForEmail, getPublicInvitation, getReviewPhoto, submitReview, reservePhotoUpload,
  listReviewRecords, listPublishedReviews, moderateReview, editReviewText, removeReviewPhoto } from "../reviewStore";
import { createCustomHatRequest, customHatInvite, listCustomHatRequests, reserveCustomHatUpload, submitCustomHatRequest, deleteCustomHatRequest } from "../customHats/store";
import { currentReviewRanking, reviewFingerprint, REVIEW_RUBRIC_VERSION, type ReviewRanking } from "../reviewRanking";
import { processReviewRankings } from "../reviewScoring";
import { processReviewRequests, processReviewRewards, sendReviewReward } from "../reviewAutomation";
import type { CustomHatSubmission } from "../customHats/shared";

const mocks = vi.hoisted(() => ({
  redis: { hget: vi.fn(), hgetall: vi.fn(), eval: vi.fn(), set: vi.fn(), get: vi.fn(), hset: vi.fn(), del: vi.fn() },
  paid: vi.fn(), orders: vi.fn(), head: vi.fn(), del: vi.fn(), upload: vi.fn(), download: vi.fn(), exists: vi.fn(), remove: vi.fn(),
}));
vi.mock("./client", () => ({ postgresStore: () => ({ db }) }));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.redis; } } }));
vi.mock("../admin/orders", () => ({ completionKey: () => "orders:completed", getPaidOrder: mocks.paid, findPaidOrdersByEmail: mocks.orders }));
vi.mock("@vercel/blob", () => ({ head: mocks.head, del: mocks.del, get: vi.fn(), BlobError: class extends Error {} }));
vi.mock("../customHats/storage", () => ({ isR2Configured: () => true, r2: () => ({ uploadUrl: mocks.upload, downloadUrl: mocks.download, exists: mocks.exists, remove: mocks.remove }) }));

const pg = new PGlite({ extensions: { pg_trgm } }), db = drizzle(pg, { schema });
const reviews = reviewDomain(db, "test"), requests = customHatDomain(db, "test");
const order = { reference: "synthetic-order", email: "synthetic@example.invalid", name: "Synthetic Customer", items: [{ colour: "green" }] };
const input = { rating: 5, body: "Original experience", displayName: "Synthetic", anonymous: false, photoUrls: [] as string[], consent: true };
const at = "2026-01-01T00:00:00.000Z";

async function invited(photos = false) {
  const invite = await createReviewInvitation(order.reference, { photosRequired: photos });
  const visible = await getPublicInvitation(invite.token);
  const pathname = `reviews/pending/${visible.uploadKey}/original.jpg`;
  const url = `https://synthetic.private.blob.vercel-storage.com/${pathname}`;
  return { ...invite, pathname, url };
}
async function submitted(photos = false) {
  const invite = await invited(photos);
  const result = await submitReview(invite.token, { ...input, photoUrls: photos ? [invite.url] : [] });
  return { ...invite, ...result };
}
function design(key: string | null = null): CustomHatSubmission {
  const blank = { enabled: false, fileKey: null, fileName: null, fileType: null, notes: "" };
  return { contact: { name: "Synthetic", company: "", email: "synthetic@example.invalid", phone: "" }, notes: "Original notes",
    hats: [{ id: "hat", colour: "L-402", quantity: 2, front: key ? { enabled: true, fileKey: key, fileName: "logo.svg", fileType: "image/svg+xml", notes: "" } : blank, back: blank, tag: { enabled: false, text: "" }, notes: "" }] };
}

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); }, 30_000);
afterAll(async () => { await pg.close(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(async () => {
  await pg.exec("truncate table environments cascade");
  vi.resetAllMocks();
  vi.stubEnv("REVIEW_CUSTOM_STORE", "postgres");
  vi.stubEnv("REVIEW_CUSTOM_PAUSED", "false");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://synthetic.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "synthetic");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic");
  vi.stubEnv("REVIEW_RANKING_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  mocks.redis.hget.mockResolvedValue(at);
  mocks.redis.hgetall.mockResolvedValue({ [order.reference]: at });
  mocks.redis.eval.mockResolvedValue(1);
  mocks.redis.set.mockResolvedValue("OK");
  mocks.paid.mockResolvedValue(order); mocks.orders.mockResolvedValue([order]);
  mocks.head.mockImplementation(async (url: string) => ({ pathname: new URL(url).pathname.slice(1), size: 1000, contentType: "image/jpeg" }));
  mocks.exists.mockResolvedValue(true);
  mocks.upload.mockResolvedValue({ url: "https://synthetic.invalid/signed-put", headers: {} });
  mocks.download.mockResolvedValue("https://synthetic.invalid/signed-get");
});

describe("single-store selection and pause", () => {
  it("defaults to Redis and rejects unknown settings and hosted PostgreSQL previews", () => {
    expect(reviewCustomStore({})).toBe("redis");
    expect(() => reviewCustomStore({ REVIEW_CUSTOM_STORE: "typo" })).toThrow("configuration");
    expect(() => reviewCustomStore({ REVIEW_CUSTOM_STORE: "postgres", VERCEL_ENV: "preview" })).toThrow("previews");
  });
  it("blocks mutations and shared jobs before provider or Redis calls while allowing reads", async () => {
    const saved = await submitted();
    vi.stubEnv("REVIEW_CUSTOM_PAUSED", "true");
    vi.clearAllMocks();
    const actions = [() => createReviewInvitation(order.reference), () => createReviewInvitationForEmail(order.email, "synthetic"),
      () => reservePhotoUpload(saved.token, saved.pathname), () => submitReview(saved.token, input), () => moderateReview(saved.id, "published"),
      () => editReviewText(saved.id, "Changed text"), () => removeReviewPhoto(saved.id, saved.url), () => createCustomHatRequest({ name: "Synthetic" }),
      () => reserveCustomHatUpload("x".repeat(32), { contentType: "image/svg+xml", size: 100 }), () => submitCustomHatRequest("x".repeat(32), design()),
      () => deleteCustomHatRequest("synthetic"), () => processReviewRankings(), () => processReviewRequests(), () => processReviewRewards(),
      () => sendReviewReward("synthetic"), () => cleanupReviewTemporaryState()];
    for (const action of actions) await expect(action()).rejects.toMatchObject({ status: 503 });
    expect(await listReviewRecords()).toHaveLength(1);
    expect(mocks.redis.hget).not.toHaveBeenCalled(); expect(mocks.redis.hgetall).not.toHaveBeenCalled();
    expect(mocks.redis.eval).not.toHaveBeenCalled(); expect(mocks.paid).not.toHaveBeenCalled(); expect(mocks.del).not.toHaveBeenCalled();
  });
  it("does not fall back to Redis if PostgreSQL fails", async () => {
    const failure = vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("synthetic outage"); });
    await expect(listReviewRecords()).rejects.toThrow("synthetic outage");
    expect(mocks.redis.hgetall).not.toHaveBeenCalled();
    failure.mockRestore();
  });
});

describe("PostgreSQL review entry points", () => {
  it("replaces invitations atomically and preserves safe public DTOs", async () => {
    const first = await invited(), second = await invited();
    expect(await getPublicInvitation(first.token)).toEqual({ valid: false, used: false });
    const visible = await getPublicInvitation(second.token);
    expect(visible).toMatchObject({ valid: true, used: false, photosRequired: false, suggestedName: "Synthetic" });
    expect(visible).not.toHaveProperty("email"); expect(visible).not.toHaveProperty("tokenDigest");
    expect((await db.select().from(schema.reviewInvitations)).map(row => row.state).sort()).toEqual(["active", "revoked"]);
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });
  it("serializes competing replacements with exactly one current invitation", async () => {
    const results = await Promise.all([invited(), invited()]);
    const validity = await Promise.all(results.map(result => getPublicInvitation(result.token)));
    expect(validity.filter(result => result.valid)).toHaveLength(1);
  });
  it("accepts one concurrent submission, rechecks Paystack and atomically claims the order", async () => {
    const invite = await invited();
    const outcomes = await Promise.allSettled([submitReview(invite.token, input), submitReview(invite.token, input)]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(schema.reviewClaims)).toHaveLength(1);
    expect(await listReviewRecords()).toHaveLength(1);
    expect((await getPublicInvitation(invite.token)).used).toBe(true);
    expect(mocks.paid.mock.calls.length).toBeGreaterThanOrEqual(2);
    await expect(createReviewInvitation(order.reference)).rejects.toMatchObject({ status: 409 });
    expect(mocks.redis.hset).not.toHaveBeenCalled();
  });
  it("rejects a replaced link after provider verification and rolls back without claiming it", async () => {
    const invite = await invited(true);
    mocks.head.mockImplementationOnce(async () => {
      await invited(true);
      return { pathname: invite.pathname, size: 1000, contentType: "image/jpeg" };
    });
    await expect(submitReview(invite.token, { ...input, photoUrls: [invite.url] })).rejects.toMatchObject({ status: 404 });
    expect(await listReviewRecords()).toHaveLength(0);
    expect(await db.select().from(schema.reviewClaims)).toHaveLength(0);
  });
  it("does not consume a link when payment or Blob verification fails", async () => {
    const invite = await invited(true);
    mocks.head.mockRejectedValueOnce(new Error("synthetic missing file"));
    await expect(submitReview(invite.token, { ...input, photoUrls: [invite.url] })).rejects.toMatchObject({ status: 503 });
    mocks.paid.mockRejectedValueOnce(new Error("synthetic reversal"));
    await expect(submitReview(invite.token, { ...input, photoUrls: [invite.url] })).rejects.toThrow("reversal");
    expect((await getPublicInvitation(invite.token)).used).toBe(false);
    expect(await db.select().from(schema.reviewClaims)).toHaveLength(0);
  });
  it("preserves source expiry, bounded upload attempts and exact photo references", async () => {
    const invite = await invited(true);
    const first = await reservePhotoUpload(invite.token, invite.pathname);
    expect(first).toBe((await getPublicInvitation(invite.token)).uploadKey);
    const [original] = await db.select().from(schema.reviewUploads);
    await reservePhotoUpload(invite.token, invite.pathname);
    expect((await db.select().from(schema.reviewUploads))[0].expiresAt).toBe(original.expiresAt);
    for (let i = 1; i < 12; i++) await reservePhotoUpload(invite.token, invite.pathname.replace("original", String(i)));
    await expect(reservePhotoUpload(invite.token, invite.pathname.replace("original", "overflow"))).rejects.toMatchObject({ status: 429 });
    const saved = await submitReview(invite.token, { ...input, photoUrls: [invite.url] });
    const [photo] = (await db.select().from(schema.reviewUploads)).filter(row => row.reviewId === saved.id);
    expect(photo).toMatchObject({ pathname: invite.pathname, url: invite.url, expiresAt: null, tokenDigest: digest(invite.token) });
    expect(await getReviewPhoto(saved.id, 0)).toBeNull();
    expect(await getReviewPhoto(saved.id, 0, true)).toEqual({ url: invite.url, pathname: invite.pathname });
    await moderateReview(saved.id, "published");
    expect(await getReviewPhoto(saved.id, 0)).toEqual({ url: invite.url, pathname: invite.pathname });
    expect((await listPublishedReviews()).reviews[0]).not.toHaveProperty("customerEmail");
  });
  it("locks edits against moderation/removal without losing unrelated changes", async () => {
    const saved = await submitted(true);
    await Promise.all([editReviewText(saved.id, "Updated experience"), moderateReview(saved.id, "published")]);
    expect((await listReviewRecords())[0]).toMatchObject({ body: "Updated experience", status: "published", photos: [{ url: saved.url, pathname: saved.pathname }] });
    await removeReviewPhoto(saved.id, saved.url);
    expect(mocks.del).toHaveBeenCalledWith(saved.url);
    expect(await getReviewPhoto(saved.id, 0, true)).toBeNull();
    expect(await db.select().from(schema.reviewUploads)).toHaveLength(0);
  });
  it("closes public photo access before rejection deletes files, keeping metadata retryable on failure", async () => {
    const saved = await submitted(true);
    await moderateReview(saved.id, "published");
    mocks.del.mockRejectedValueOnce(new Error("synthetic provider failure"));
    await expect(moderateReview(saved.id, "rejected")).rejects.toThrow("provider failure");
    expect(await getReviewPhoto(saved.id, 0)).toBeNull();
    expect(await getReviewPhoto(saved.id, 0, true)).not.toBeNull();
    await moderateReview(saved.id, "rejected");
    expect((await listReviewRecords())[0]).toMatchObject({ status: "rejected", photos: [] });
    expect(await db.select().from(schema.reviewUploads)).toHaveLength(0);
  });
  it("keeps email access rate limits/completion dates in Redis but looks up reviews in SQL", async () => {
    const invite = await createReviewInvitationForEmail(order.email, "synthetic-ip");
    await submitReview(invite.token, { ...input, photoUrls: [
      `https://synthetic.private.blob.vercel-storage.com/reviews/pending/${(await getPublicInvitation(invite.token)).uploadKey}/original.jpg`,
    ] });
    await expect(createReviewInvitationForEmail(order.email, "synthetic-ip")).rejects.toMatchObject({ status: 409 });
    expect(mocks.redis.eval).toHaveBeenCalledTimes(2);
    expect(mocks.redis.hgetall.mock.calls.every(([key]) => key === "orders:completed")).toBe(true);
  });
  it("isolates live/test records and refuses expired invitations without extending them", async () => {
    const invite = await invited();
    expect(await reviewDomain(db, "live").invitation(digest(invite.token))).toBeNull();
    await db.update(schema.reviewInvitations).set({ createdAt: at, expiresAt: "2026-01-02T00:00:00.000Z" });
    expect(await getPublicInvitation(invite.token)).toEqual({ valid: false, used: false });
    await expect(submitReview(invite.token, input)).rejects.toMatchObject({ status: 404 });
    expect(new Date((await db.select().from(schema.reviewInvitations))[0].expiresAt).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("custom design records with unchanged R2 calls", () => {
  it("preserves tokens, file keys, previews and every new revision without leaking tokens publicly", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic", email: order.email });
    const upload = await reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 });
    expect(upload.key).toMatch(new RegExp(`^custom-hats/test/${request.id}/`));
    const first = await submitCustomHatRequest(request.token, design(upload.key));
    const second = await submitCustomHatRequest(request.token, { ...design(upload.key), notes: "Revised notes" });
    expect([first.revision, second.revision]).toEqual([1, 2]);
    expect(await db.select().from(schema.customRevisions)).toHaveLength(2);
    expect(mocks.exists).toHaveBeenCalledTimes(1);
    const invite = await customHatInvite(request.token);
    expect(invite).toMatchObject({ valid: true, submission: { notes: "Revised notes" }, files: { [upload.key]: "https://synthetic.invalid/signed-get" } });
    expect(invite).not.toHaveProperty("token");
    expect((await listCustomHatRequests("https://synthetic.invalid"))[0].url).toBe(`https://synthetic.invalid/custom/${request.token}`);
    expect(await customHatDomain(db, "live").forToken(request.token)).toBeNull();
    expect(mocks.redis.set).not.toHaveBeenCalled(); expect(mocks.redis.hset).not.toHaveBeenCalled();
  });
  it("rejects foreign artwork and incomplete uploads without saving a revision", async () => {
    const one = await createCustomHatRequest({ name: "One" }), two = await createCustomHatRequest({ name: "Two" });
    const upload = await reserveCustomHatUpload(one.token, { contentType: "image/svg+xml", size: 100 });
    await expect(submitCustomHatRequest(two.token, design(upload.key))).rejects.toThrow();
    mocks.exists.mockResolvedValueOnce(false);
    await expect(submitCustomHatRequest(one.token, design(upload.key))).rejects.toThrow("finish uploading");
    expect(await db.select().from(schema.customRevisions)).toHaveLength(0);
  });
  it("serializes revisions and rejects stale submissions instead of overwriting a newer edit", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic" });
    const outcomes = await Promise.allSettled([requests.submit(request.id, 0, design()), requests.submit(request.id, 0, { ...design(), notes: "Concurrent" })]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(schema.customRevisions)).toHaveLength(1);
    expect((await requests.find(request.id))?.revision).toBe(1);
  });
  it("enforces the upload limit under concurrent reservations", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic" });
    await db.insert(schema.customFiles).values(Array.from({ length: 79 }, (_, i) => ({ environment: "test", requestId: request.id, fileKey: `custom-hats/test/${request.id}/${i}.svg` })));
    const outcomes = await Promise.allSettled(["last", "overflow"].map(name => requests.reserve(request.id, `custom-hats/test/${request.id}/${name}.svg`)));
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(await requests.files(request.id)).toHaveLength(80);
  });
  it("retains ownership on failed deletion, then removes submitted and unsubmitted R2 files normally", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic" });
    const first = await reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 });
    const second = await reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 });
    await submitCustomHatRequest(request.token, design(first.key));
    mocks.remove.mockRejectedValueOnce(new Error("synthetic delete failure"));
    await expect(deleteCustomHatRequest(request.id)).rejects.toMatchObject({ status: 503 });
    expect(await requests.files(request.id)).toHaveLength(2);
    expect(await requests.find(request.id)).not.toBeNull();
    await deleteCustomHatRequest(request.id);
    expect(mocks.remove).toHaveBeenCalledWith(first.key); expect(mocks.remove).toHaveBeenCalledWith(second.key);
    expect(await db.select().from(schema.customFiles)).toHaveLength(0);
    expect(await db.select().from(schema.customRevisions)).toHaveLength(0);
    expect((await customHatInvite(request.token)).valid).toBe(false);
  });
  it("does not reactivate expired links or accept expired ownership", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic" });
    const upload = await reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 });
    await db.update(schema.customFiles).set({ expiresAt: at });
    await expect(submitCustomHatRequest(request.token, design(upload.key))).rejects.toThrow();
    await db.update(schema.customRequests).set({ expiresAt: at });
    expect((await customHatInvite(request.token)).valid).toBe(false);
    await expect(reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 })).rejects.toMatchObject({ status: 404 });
  });
  it("opens imported original links and continues from the latest historical revision, not revision one", async () => {
    const request = await createCustomHatRequest({ name: "Synthetic" });
    const upload = await reserveCustomHatUpload(request.token, { contentType: "image/svg+xml", size: 100 });
    await db.insert(schema.customRevisions).values({ environment: "test", requestId: request.id, revision: 4, submittedAt: at, submission: design(upload.key) });
    await db.update(schema.customRequests).set({ revision: 4, submittedAt: at });
    expect(await customHatInvite(request.token)).toMatchObject({ valid: true, submittedAt: at, submission: design(upload.key) });
    expect((await submitCustomHatRequest(request.token, design(upload.key))).revision).toBe(5);
    expect((await db.select().from(schema.customRevisions)).map(row => row.revision)).toEqual([4, 5]);
    await db.update(schema.customFiles).set({ expiresAt: at });
    mocks.download.mockClear();
    expect((await customHatInvite(request.token)).files).toEqual({});
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

describe("saved rankings and explicit temporary-state cleanup", () => {
  it("writes new scores only to PostgreSQL while keeping advisory locks in Redis", async () => {
    const saved = await submitted();
    await moderateReview(saved.id, "published");
    const scores = { usefulness: 5, specificity: 5, context: 5, clarity: 5, imageEvidence: 0, reason: "Synthetic reason" };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(scores) }] }] }) });
    vi.stubGlobal("fetch", fetcher);
    expect(await processReviewRankings()).toMatchObject({ scored: 1, failed: 0 });
    expect((await reviews.rankings())[saved.id]).toMatchObject({ score: 50, reason: "Synthetic reason" });
    expect(await reviews.retry(saved.id)).toBeNull();
    expect(mocks.redis.set).toHaveBeenCalledWith(expect.stringContaining(":lock:"), expect.any(String), { nx: true, ex: 180 });
    expect(mocks.redis.hset).not.toHaveBeenCalled(); expect(mocks.redis.get).not.toHaveBeenCalled(); expect(mocks.redis.del).not.toHaveBeenCalled();
  });
  it("stores scoring failures and their original attempt count durably without Redis retry keys", async () => {
    const saved = await submitted();
    const record = await moderateReview(saved.id, "published");
    await reviews.saveRetry(saved.id, { fingerprint: reviewFingerprint(record), attempts: 2, nextAttemptAt: Date.now() + 3600_000 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await processReviewRankings({ ignoreRetryBackoff: true })).toMatchObject({ scored: 0, failed: 1 });
      expect(await reviews.retry(saved.id)).toMatchObject({ attempts: 3 });
      expect(log).toHaveBeenCalledWith("Review helpfulness scoring failed", { reviewId: saved.id, reason: "openai_http_429" });
      expect(mocks.redis.set.mock.calls.every(([key]) => key.includes(":lock:"))).toBe(true);
      expect(mocks.redis.hset).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("serves migrated SQL rankings without touching Redis score hashes or calling AI", async () => {
    const saved = await submitted();
    const record = await moderateReview(saved.id, "published");
    const ranking: ReviewRanking = { usefulness: 5, specificity: 5, context: 5, clarity: 5, imageEvidence: 0, score: 50,
      reason: "Original reason", fingerprint: reviewFingerprint(record), rubricVersion: REVIEW_RUBRIC_VERSION, model: "original-model", scoredAt: at };
    await reviews.saveRanking(record.id, ranking);
    expect(currentReviewRanking(record, ranking)).toBe(true);
    expect((await listPublishedReviews()).sort).toBe("helpful");
    expect(mocks.redis.hgetall).not.toHaveBeenCalled();
    const result = await processReviewRankings();
    expect(result.scored).toBe(0);
    expect(mocks.redis.hgetall).not.toHaveBeenCalled();
  });
  it("honours imported retry deadlines and expiry without restarting their windows", async () => {
    const saved = await submitted();
    await moderateReview(saved.id, "published");
    const [record] = await listReviewRecords();
    await reviews.saveRetry(record.id, { fingerprint: reviewFingerprint(record), attempts: 3, nextAttemptAt: Date.now() + 3600_000, sourceExpiresAt: "2099-01-01T00:00:00.000Z" });
    expect((await processReviewRankings()).scored).toBe(0);
    expect((await reviews.retry(record.id))?.attempts).toBe(3);
    await reviews.saveRetry(record.id, { fingerprint: reviewFingerprint(record), attempts: 3, nextAttemptAt: Date.now() + 3600_000, sourceExpiresAt: at });
    expect(await reviews.retry(record.id)).toBeNull();
  });
  it("expires invitations, unsubmitted reservations and retry state, never claims/reviews/provider files", async () => {
    const saved = await submitted(true);
    await reviews.saveRetry(saved.id, { fingerprint: "original", attempts: 2, nextAttemptAt: 1, sourceExpiresAt: at });
    await db.update(schema.reviewInvitations).set({ expiresAt: "2026-01-02T00:00:00.000Z", createdAt: at });
    // Keep the used invitation and its review; a second expired invitation can be marked expired.
    await db.insert(schema.orders).values({ environment: "test", reference: "expired-order", paymentStatus: "unknown", snapshot: {} });
    await db.insert(schema.reviewInvitations).values({ environment: "test", tokenDigest: "a".repeat(64), orderReference: "expired-order", state: "active", details: {}, createdAt: at, expiresAt: at });
    await db.insert(schema.reviewUploads).values({ environment: "test", tokenDigest: "a".repeat(64), pathname: "expired-reservation", expiresAt: at });
    const result = await cleanupReviewTemporaryState();
    expect(result).toEqual({ enabled: true, invitations: 1, uploads: 1, retries: 1 });
    expect(await db.select().from(schema.reviewClaims)).toHaveLength(1);
    expect(await db.select().from(schema.reviews)).toHaveLength(1);
    expect(await db.select().from(schema.reviewUploads)).toHaveLength(1);
    expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
    expect(await reviews.retry(saved.id)).toBeNull();
  });
});
