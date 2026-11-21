import { reviewNamespace } from "./reviewNamespace";
import { assertReviewCustomWritable, reviewCustomDatabase, reviewCustomStore } from "./reviewCustomPersistence";
import { reviewDomain } from "./db/review-domain";

export async function cleanupReviewTemporaryState() {
  assertReviewCustomWritable();
  if (reviewCustomStore() !== "postgres") return { enabled: false };
  return { enabled: true, ...await reviewDomain(await reviewCustomDatabase(), reviewNamespace()).expireTemporaryState() };
}
