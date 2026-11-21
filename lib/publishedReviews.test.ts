import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((read: () => Promise<unknown>) => read),
  revalidateTag: vi.fn(),
}));
vi.mock("./reviewStore", () => ({ listPublishedReviews: vi.fn() }));

import { revalidateTag, unstable_cache } from "next/cache";
import { listPublishedReviews } from "./reviewStore";
import { getPublishedReviews, invalidatePublishedReviews } from "./publishedReviews";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  vi.stubEnv("REVIEW_CUSTOM_STORE", "redis");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("published review cache", () => {
  it.each(["live", "test"] as const)("isolates the %s cache and store read", async namespace => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", `sk_${namespace}_example`);
    const data = { reviews: [], summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, sort: "newest" as const };
    vi.mocked(listPublishedReviews).mockResolvedValue(data);
    expect(await getPublishedReviews()).toBe(data);
    expect(listPublishedReviews).toHaveBeenCalledWith(namespace);
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["published-reviews-v1", namespace, "redis"], {
      revalidate: 60, tags: [`published-reviews:${namespace}`],
    });
  });

  it("separates the PostgreSQL cache and blocks previews before any cache hit", async () => {
    vi.stubEnv("REVIEW_CUSTOM_STORE", "postgres");
    vi.mocked(listPublishedReviews).mockResolvedValue({ reviews: [], summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, sort: "newest" });
    await getPublishedReviews();
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["published-reviews-v1", "live", "postgres"], expect.any(Object));
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "preview");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getPublishedReviews()).toBeNull();
    expect(unstable_cache).not.toHaveBeenCalled();
    expect(listPublishedReviews).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("returns a safe fallback when storage fails, allowing later reads to retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listPublishedReviews).mockRejectedValue(new Error("private storage details"));
    expect(await getPublishedReviews()).toBeNull();
    expect(log).toHaveBeenCalledWith("Published reviews are temporarily unavailable.");
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("private storage"));
  });

  it("expires only the selected environment immediately", () => {
    invalidatePublishedReviews();
    invalidatePublishedReviews("test");
    expect(revalidateTag).toHaveBeenNthCalledWith(1, "published-reviews:live", { expire: 0 });
    expect(revalidateTag).toHaveBeenNthCalledWith(2, "published-reviews:test", { expire: 0 });
  });

  it("keeps sample reviews local to development and bypasses storage", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const data = await getPublishedReviews();
    expect(data?.reviews[0].id).toMatch(/^dev-/);
    expect(listPublishedReviews).not.toHaveBeenCalled();
    expect(unstable_cache).not.toHaveBeenCalled();
  });
});
