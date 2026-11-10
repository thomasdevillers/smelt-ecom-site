import { createHash } from "node:crypto";
import type { ReviewRecord } from "./reviews";
import { reviewNamespace, type ReviewNamespace } from "./reviewNamespace";

export const REVIEW_RUBRIC_VERSION = "sauna-helpfulness-v1";
export const reviewRankingModel = () => process.env.REVIEW_RANKING_MODEL?.trim() || "gpt-4.1-mini";
export const reviewRankingEnabled = () => process.env.REVIEW_RANKING_ENABLED === "true";
export const reviewRankingPrefix = (mode: ReviewNamespace = reviewNamespace()) => `smelt:reviews:v1:${mode}:ranking`;

export type ReviewScores = {
  usefulness: number;
  specificity: number;
  context: number;
  clarity: number;
  imageEvidence: number;
  reason: string;
};

export type ReviewRanking = ReviewScores & {
  score: number;
  fingerprint: string;
  rubricVersion: string;
  model: string;
  scoredAt: string;
};

export function reviewFingerprint(review: ReviewRecord): string {
  return createHash("sha256").update(JSON.stringify({
    rubric: REVIEW_RUBRIC_VERSION, model: reviewRankingModel(), product: review.productId,
    body: review.body, colours: review.colours, photos: review.photos,
  })).digest("hex");
}

export function parseReviewScores(value: unknown): ReviewScores {
  if (!value || typeof value !== "object") throw new Error("Invalid review scores.");
  const scores = value as ReviewScores;
  for (const key of ["usefulness", "specificity", "context", "clarity", "imageEvidence"] as const) {
    if (!Number.isInteger(scores[key]) || scores[key] < 0 || scores[key] > 10) throw new Error("Invalid review scores.");
  }
  if (typeof scores.reason !== "string" || !scores.reason.trim() || scores.reason.length > 600) throw new Error("Invalid review reason.");
  return scores;
}

export function weightedReviewScore(scores: ReviewScores, hasPhotos: boolean): number {
  // Text alone can reach 100. Useful visual evidence adds at most five points.
  return Math.round((scores.usefulness * 3.5 + scores.specificity * 3 + scores.context * 2 + scores.clarity * 1.5
    + (hasPhotos ? scores.imageEvidence * .5 : 0)) * 100) / 100;
}

export function currentReviewRanking(review: ReviewRecord, ranking?: ReviewRanking): ranking is ReviewRanking {
  if (!ranking || ranking.fingerprint !== reviewFingerprint(review)) return false;
  try {
    parseReviewScores(ranking);
    return ranking.score === weightedReviewScore(ranking, review.photos.length > 0);
  } catch { return false; }
}

export function rankReviewRecords(reviews: ReviewRecord[], rankings: Record<string, ReviewRanking>): ReviewRecord[] {
  return [...reviews].sort((a, b) => {
    const left = currentReviewRanking(a, rankings[a.id]) ? rankings[a.id].score : -1;
    const right = currentReviewRanking(b, rankings[b.id]) ? rankings[b.id].score : -1;
    return right - left || b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id);
  });
}
