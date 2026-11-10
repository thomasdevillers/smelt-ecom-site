import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewRecord } from "./reviews";
import { currentReviewRanking, parseReviewScores, rankReviewRecords, reviewFingerprint, reviewRankingPrefix, weightedReviewScore, REVIEW_RUBRIC_VERSION, type ReviewRanking } from "./reviewRanking";

export const reviewFixture: ReviewRecord = {
  id: "review-1", productId: "smelt-sauna-hat", orderReference: "private-order", customerEmail: "private@example.com",
  displayName: "Private Name", anonymous: false, rating: 2, body: "Fits over my long hair and dries overnight.",
  colours: ["green"], photos: [], verifiedPurchase: true, status: "published",
  submittedAt: "2026-10-01T00:00:00.000Z", publishedAt: "2026-10-02T00:00:00.000Z", consentVersion: "2026-09-17",
};

const scores = { usefulness: 8, specificity: 9, context: 6, clarity: 8, imageEvidence: 0, reason: "Specific fit and drying observations." };
function ranking(review = reviewFixture, value = scores): ReviewRanking {
  return { ...value, score: weightedReviewScore(value, review.photos.length > 0), fingerprint: reviewFingerprint(review),
    rubricVersion: REVIEW_RUBRIC_VERSION, model: "gpt-4.1-mini", scoredAt: "2026-11-01T00:00:00.000Z" };
}

afterEach(() => vi.unstubAllEnvs());

describe("review helpfulness rubric", () => {
  it("allows text-only reviews to reach 100 and caps image evidence at five extra points", () => {
    const perfect = { ...scores, usefulness: 10, specificity: 10, context: 10, clarity: 10, imageEvidence: 10 };
    expect(weightedReviewScore(perfect, false)).toBe(100);
    expect(weightedReviewScore(perfect, true)).toBe(105);
    expect(weightedReviewScore({ ...perfect, usefulness: 0, specificity: 0, context: 0, clarity: 0 }, true)).toBe(5);
  });
  it.each([null, {}, { ...scores, clarity: 11 }, { ...scores, clarity: -1 }, { ...scores, clarity: 2.5 }, { ...scores, clarity: "8" }, { ...scores, reason: "" }])("rejects invalid model output %j", value => {
    expect(() => parseReviewScores(value)).toThrow();
  });
  it("invalidates changed content, photos, colours and models, but not ratings or identity", () => {
    const saved = ranking();
    expect(currentReviewRanking({ ...reviewFixture, rating: 5, displayName: "Other", customerEmail: "other@example.com" }, saved)).toBe(true);
    for (const changed of [{ ...reviewFixture, body: "New text" }, { ...reviewFixture, photos: [{ url: "new", pathname: "new" }] }, { ...reviewFixture, colours: ["cream"] as ReviewRecord["colours"] }]) {
      expect(currentReviewRanking(changed, saved)).toBe(false);
    }
    vi.stubEnv("REVIEW_RANKING_MODEL", "different-model");
    expect(currentReviewRanking(reviewFixture, saved)).toBe(false);
  });
  it("ranks helpful negative reviews over generic praise, ignores stale scores and preserves unscored reviews", () => {
    const praise = { ...reviewFixture, id: "praise", rating: 5, body: "Love it!", submittedAt: "2026-11-01" };
    const unscored = { ...reviewFixture, id: "new", submittedAt: "2026-11-02" };
    const stale = { ...reviewFixture, id: "stale", body: "Changed", submittedAt: "2026-11-03" };
    const rankings = { [reviewFixture.id]: ranking(), praise: ranking(praise, { ...scores, usefulness: 1, specificity: 1, context: 0 }), stale: ranking() };
    expect(rankReviewRecords([praise, unscored, stale, reviewFixture], rankings).map(item => item.id)).toEqual(["review-1", "praise", "stale", "new"]);
  });
  it("uses newest submission then ID for ties and does not mutate the source array", () => {
    const older = { ...reviewFixture, id: "older" };
    const newer = { ...reviewFixture, id: "newer", submittedAt: "2026-11-02" };
    const source = [older, newer];
    expect(rankReviewRecords(source, { older: ranking(older), newer: ranking(newer) })[0].id).toBe("newer");
    expect(source[0].id).toBe("older");
  });
  it("separates live and test ranking keys", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
    expect(reviewRankingPrefix()).toContain(":test:");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
    expect(reviewRankingPrefix()).toContain(":live:");
    expect(reviewRankingPrefix("test")).toContain(":test:");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
    expect(reviewRankingPrefix("live")).toContain(":live:");
  });
});
