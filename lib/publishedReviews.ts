import { revalidateTag, unstable_cache } from "next/cache";
import { reviewNamespace, type ReviewNamespace } from "./reviewNamespace";
import { listPublishedReviews } from "./reviewStore";
import type { PublishedReviews } from "./reviews";

const reviewTag = (namespace: ReviewNamespace) => `published-reviews:${namespace}`;

export async function getPublishedReviews(): Promise<PublishedReviews | null> {
  if (process.env.NODE_ENV === "development") {
    const { developmentReviews } = await import("./devReviews");
    return developmentReviews();
  }

  const namespace = reviewNamespace();
  // Cache Components are not enabled in this app. Use the existing Data Cache
  // API rather than changing the rendering model of every route for this read.
  const read = unstable_cache(
    () => listPublishedReviews(namespace),
    ["published-reviews-v1", namespace],
    { revalidate: 60, tags: [reviewTag(namespace)] },
  );
  try {
    return await read();
  } catch {
    // Do not cache a failed read as an empty review list or expose store errors.
    console.error("Published reviews are temporarily unavailable.");
    return null;
  }
}

export function invalidatePublishedReviews(namespace: ReviewNamespace = reviewNamespace()) {
  // Moderation/photo removals must not continue serving the old public content.
  revalidateTag(reviewTag(namespace), { expire: 0 });
}
