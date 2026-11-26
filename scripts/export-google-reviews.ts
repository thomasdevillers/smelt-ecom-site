import { mkdir, writeFile } from "node:fs/promises";
import manualReviewData from "../content/manual-reviews.json";
import { googleReviewFeed } from "../lib/googleReviewFeed";
import { manualGoogleReviews } from "../lib/manualGoogleReviews";
import { listReviewRecords } from "../lib/reviewStore";

async function main() {
  if (process.argv.length > 2) throw new Error("No arguments supported.");
  // Explicit live namespace: a test payment key must never export test reviews.
  const manual = manualGoogleReviews(manualReviewData);
  const feed = googleReviewFeed([...(await listReviewRecords(undefined, "live")), ...manual]);
  const directory = ".local/google-merchant";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = `${directory}/product-reviews.xml`;
  await writeFile(path, feed.xml, { mode: 0o600 });
  console.log(
    `Exported ${feed.count} published live reviews to ${path}. No source records changed.`,
  );
  console.log(
    `Includes ${manual.length} manual reviews from content/manual-reviews.json. Ensure these are also visible at /product#reviews before submission.`,
  );
  if (feed.count < 50)
    console.warn(
      `Google requires at least 50 product reviews to join; this export contains ${feed.count}.`,
    );
}

main().catch(() => {
  // Provider errors may contain credentials or private customer records.
  console.error(
    "Review export failed. Check live review storage configuration and published review validity. No secrets logged; no source records changed.",
  );
  process.exitCode = 1;
});
