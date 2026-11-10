import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRecord } from "./reviews";

const mocks = vi.hoisted(() => ({ db: { hgetall: vi.fn(), hget: vi.fn(), hset: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn() }, list: vi.fn(), blob: vi.fn() }));
vi.mock("./admin/store", () => ({ adminStore: () => mocks.db }));
vi.mock("./reviewStore", () => ({ listReviewRecords: mocks.list }));
vi.mock("@vercel/blob", async importOriginal => ({
  ...await importOriginal<typeof import("@vercel/blob")>(), get: mocks.blob,
}));

import { BlobError } from "@vercel/blob";
import { processReviewRankings, reviewScoringFailure, scoreReview } from "./reviewScoring";
import { reviewFingerprint } from "./reviewRanking";

const review: ReviewRecord = { id: "r1", productId: "smelt-sauna-hat", orderReference: "private-order", customerEmail: "secret@example.com",
  displayName: "Secret Name", anonymous: false, rating: 1, body: "Fits well over my long hair.", colours: ["green"], photos: [],
  verifiedPurchase: true, status: "published", submittedAt: "2026-11-01", publishedAt: "2026-11-01", consentVersion: "2026-09-17" };
const scores = { usefulness: 8, specificity: 7, context: 6, clarity: 9, imageEvidence: 4, reason: "Explains fit over long hair." };
const provider = (output = scores) => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("REVIEW_RANKING_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "test-secret");
  mocks.db.hgetall.mockResolvedValue({}); mocks.db.hget.mockResolvedValue(null); mocks.db.get.mockResolvedValue(null);
  mocks.db.set.mockResolvedValue("OK"); mocks.list.mockResolvedValue([review]);
  vi.stubGlobal("fetch", vi.fn(async () => provider()));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("multimodal scoring", () => {
  it("reports safe failure codes without including secrets or upstream messages", () => {
    expect(reviewScoringFailure(new Error("Review scoring provider status 401."))).toBe("openai_http_401");
    expect(reviewScoringFailure(new Error("No blob credentials found. secret-details"))).toBe("blob_credentials_missing");
    expect(reviewScoringFailure(new Error("secret credential details"))).toBe("unexpected_scoring_error");
  });
  it("recognises SDK Blob errors even when their name is Error", () => {
    const error = new BlobError("Failed to fetch blob: 403 Forbidden secret-details");
    expect(error.name).toBe("Error");
    expect(reviewScoringFailure(error)).toBe("blob_http_403");
    expect(reviewScoringFailure(new BlobError("secret credential details"))).toBe("blob_error");
  });
  it("sends no identity, rating or order details and enforces no-photo evidence of zero", async () => {
    const result = await scoreReview(review);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content).toEqual([{ type: "input_text", text: JSON.stringify({ review: review.body, colours: review.colours }) }]);
    for (const privateValue of [review.customerEmail, review.orderReference, review.displayName]) expect(JSON.stringify(body)).not.toContain(privateValue);
    expect(result.imageEvidence).toBe(0);
    expect(result.fingerprint).toBe(reviewFingerprint(review));
  });
  it("loads private photos with Blob credentials and sends bytes rather than private URLs", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-blob-token");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "stale-oidc-token");
    const url = "https://store.private.blob.vercel-storage.com/reviews/hat.webp";
    mocks.blob.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) });
    const result = await scoreReview({ ...review, photos: [{ url, pathname: "reviews/hat.webp" }] });
    expect(mocks.blob.mock.calls[0][1].access).toBe("private");
    expect(mocks.blob.mock.calls[0][1].token).toBe("test-blob-token");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.input[0].content[1].image_url).toBe("data:image/webp;base64,AQID");
    expect(JSON.stringify(body)).not.toContain(url);
    expect(result.imageEvidence).toBe(4);
  });
  it("allows SDK OIDC authentication when no read-write token is configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    mocks.blob.mockResolvedValue(null);
    await expect(scoreReview({ ...review, photos: [{
      url: "https://store.private.blob.vercel-storage.com/hat.webp", pathname: "hat.webp",
    }] })).rejects.toThrow("Review image unavailable.");
    expect(mocks.blob.mock.calls[0][1].token).toBeUndefined();
  });
  it("does not silently score text when photos are unavailable or from untrusted hosts", async () => {
    await expect(scoreReview({ ...review, photos: [{ url: "https://evil.example/hat.webp", pathname: "hat.webp" }] })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed or incomplete provider responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(provider({ ...scores, usefulness: 99 }));
    await expect(scoreReview(review)).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ status: "incomplete" }));
    await expect(scoreReview(review)).rejects.toThrow();
  });
});

describe("background scoring and retries", () => {
  it("uses the explicit namespace for reads, score writes, retry state and locks without modifying payment mode", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_unchanged");
    expect((await processReviewRankings({ mode: "live" })).scored).toBe(1);
    expect(mocks.list).toHaveBeenCalledWith("published", "live");
    expect(mocks.db.hgetall).toHaveBeenCalledWith("smelt:reviews:v1:live:ranking:scores");
    expect(mocks.db.hset.mock.calls[0][0]).toBe("smelt:reviews:v1:live:ranking:scores");
    expect(mocks.db.get.mock.calls[0][0]).toBe("smelt:reviews:v1:live:ranking:retry:r1");
    expect(mocks.db.set.mock.calls[0][0]).toBe("smelt:reviews:v1:live:ranking:lock:r1");
    expect(mocks.db.eval.mock.calls[0][1]).toEqual(["smelt:reviews:v1:live:ranking:lock:r1"]);
    expect(process.env.PAYSTACK_SECRET_KEY).toBe("sk_test_unchanged");
  });
  it("does nothing while disabled", async () => {
    vi.stubEnv("REVIEW_RANKING_ENABLED", "false");
    expect((await processReviewRankings()).enabled).toBe(false);
    expect(mocks.list).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("stores scores separately and skips already current results", async () => {
    expect(await processReviewRankings()).toEqual({ enabled: true, scored: 1, failed: 0 });
    expect(mocks.db.hset.mock.calls[0][0]).toContain(":ranking:scores");
    const ranking = mocks.db.hset.mock.calls[0][1][review.id];
    expect(ranking.fingerprint).toBe(reviewFingerprint(review));
    mocks.db.hgetall.mockResolvedValue({ [review.id]: ranking });
    vi.mocked(fetch).mockClear();
    await processReviewRankings(); expect(fetch).not.toHaveBeenCalled();
  });
  it("skips work held by another worker", async () => {
    mocks.db.set.mockResolvedValue(null);
    expect((await processReviewRankings()).scored).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("rechecks completed results after acquiring the lock", async () => {
    const ranking = await scoreReview(review);
    mocks.db.hget.mockResolvedValue(ranking); vi.mocked(fetch).mockClear();
    await processReviewRankings(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.db.eval).toHaveBeenCalled();
  });
  it("backs off failures without publishing partial scores", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Provider failure"));
    expect(await processReviewRankings()).toEqual({ enabled: true, scored: 0, failed: 1 });
    expect(mocks.db.hset).not.toHaveBeenCalled(); expect(mocks.db.eval).toHaveBeenCalled();
    expect(mocks.db.set.mock.calls[1][1]).toMatchObject({ attempts: 1, fingerprint: reviewFingerprint(review) });
  });
  it("skips cooling-down records without starving other reviews, but changed input bypasses backoff", async () => {
    mocks.list.mockResolvedValue([review, { ...review, id: "r2" }]);
    mocks.db.get.mockResolvedValueOnce({ fingerprint: reviewFingerprint(review), attempts: 1, nextAttemptAt: Date.now() + 100000 });
    expect((await processReviewRankings({ limit: 1 })).scored).toBe(1);
    expect(mocks.db.hset.mock.calls[0][1]).toHaveProperty("r2");
    mocks.db.get.mockResolvedValue({ fingerprint: "outdated", attempts: 1, nextAttemptAt: Date.now() + 100000 });
    expect((await processReviewRankings({ id: "r1" })).scored).toBe(1);
  });
  it("caps a cron batch at three calls", async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({ ...review, id: `r${index}` })));
    expect((await processReviewRankings({ limit: 100 })).scored).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("allows an explicit manual retry during backoff without rescoring current reviews", async () => {
    mocks.db.get.mockResolvedValue({ fingerprint: reviewFingerprint(review), attempts: 2, nextAttemptAt: Date.now() + 100000 });
    expect((await processReviewRankings({ id: review.id, ignoreRetryBackoff: true })).scored).toBe(1);
    const ranking = mocks.db.hset.mock.calls[0][1][review.id];
    mocks.db.hgetall.mockResolvedValue({ [review.id]: ranking });
    vi.mocked(fetch).mockClear();
    expect((await processReviewRankings({ id: review.id, ignoreRetryBackoff: true })).scored).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps concurrency locks when manually bypassing backoff", async () => {
    mocks.db.set.mockResolvedValue(null);
    expect((await processReviewRankings({ ignoreRetryBackoff: true })).scored).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
