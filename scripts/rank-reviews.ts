import { adminStore } from "../lib/admin/store";
import { listReviewRecords } from "../lib/reviewStore";
import { currentReviewRanking, rankReviewRecords, reviewRankingPrefix, type ReviewRanking } from "../lib/reviewRanking";
import { processReviewRankings } from "../lib/reviewScoring";
import { reviewRankingCredentialIssues, reviewRankingOptions } from "./review-ranking-options";

async function main() {
  const options = reviewRankingOptions(process.argv.slice(2));
  const reviews = await listReviewRecords(undefined, options.mode);
  const published = reviews.filter(review => review.status === "published");
  console.log(`Mode: ${options.mode.toUpperCase()}. Published reviews: ${published.length}. Pending: ${reviews.filter(review => review.status === "pending").length}. Rejected: ${reviews.filter(review => review.status === "rejected").length}.`);
  if (options.check) {
    console.log("OpenAI key:", process.env.OPENAI_API_KEY ? "configured" : "MISSING");
    const issues = reviewRankingCredentialIssues(published.some(review => review.photos.length > 0));
    for (const issue of issues) console.error(issue);
    if (issues.length) process.exitCode = 1;
    else console.log("Required credentials are present (access has not been verified).");
  }
  if (!published.length) {
    const otherMode = options.mode === "live" ? "test" : "live";
    const other = await listReviewRecords("published", otherMode);
    console.log(`No published reviews in ${options.mode.toUpperCase()}. ${otherMode.toUpperCase()} has ${other.length} published reviews in the configured Redis database.`);
    if (other.length) console.log(`Use: npm run reviews:rank -- --${otherMode}${options.score ? " --score" : " --check"}`);
    else console.log("Check that .env.local points to the same Upstash database as the live site, and that the reviews are published.");
    if (options.score) process.exitCode = 1;
    return;
  }
  if (options.check) return;
  if (options.score) {
    const issues = reviewRankingCredentialIssues(published.some(review => review.photos.length > 0));
    if (issues.length) {
      for (const issue of issues) console.error(issue);
      console.error("No scoring attempted. Add the missing credentials to .env.local and rerun this command.");
      process.exitCode = 1;
      return;
    }
    // Explicit paid backfill, independent of the storefront rollout flag.
    process.env.REVIEW_RANKING_ENABLED = "true";
    const existing = await adminStore().hgetall<Record<string, ReviewRanking>>(`${reviewRankingPrefix(options.mode)}:scores`) || {};
    // A manual rerun retries immediately, but only once per review per command.
    // Keep background-job backoff and concurrency locks intact.
    for (const review of published.filter(review => !currentReviewRanking(review, existing[review.id]))) {
      const result = await processReviewRankings({ mode: options.mode, id: review.id, ignoreRetryBackoff: true });
      console.log("Scoring batch:", result);
    }
  }
  const rankings = await adminStore().hgetall<Record<string, ReviewRanking>>(`${reviewRankingPrefix(options.mode)}:scores`) || {};
  const remaining = published.filter(review => !currentReviewRanking(review, rankings[review.id])).length;
  if (options.score && remaining) {
    console.error(`${remaining} published review(s) still need scores. They failed or are locked by another worker. Check the failure codes above; rerun this command to retry immediately.`);
    process.exitCode = 1;
  }
  for (const [index, review] of rankReviewRecords(published, rankings).entries()) {
    const ranking = rankings[review.id];
    const current = currentReviewRanking(review, ranking);
    console.log(JSON.stringify({ position: index + 1, id: review.id, score: current ? ranking.score : null,
      text: review.body, photos: review.photos.length, reason: current ? ranking.reason : "Not scored/current" }));
  }
  console.log("Storefront defaults to saved helpfulness scores; shoppers can switch to most recent.");
}

main().catch(error => {
  // Only display our own configuration/argument errors; provider/Redis errors
  // can contain credentials, request details or upstream response bodies.
  const safe = error instanceof Error && /^(Use --|Choose either|Scoring requires)/.test(error.message);
  console.error(safe ? error.message : "Review ranking failed. Check Redis, OpenAI and Blob configuration; no secrets were logged.");
  process.exitCode = 1;
});
