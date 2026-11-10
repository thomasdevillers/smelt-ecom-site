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
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("published review cache", () => {
  it.each(["live", "test"] as const)("isolates the %s cache and store read", async namespace => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", `sk_${namespace}_example`);
    const data = { reviews: [], summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, sort: "newest" as const };
    vi.mocked(listPublishedReviews).mockResolvedValue(data);
    expect(await getPublishedReviews()).toBe(data);
    expect(listPublishedReviews).toHaveBeenCalledWith(namespace);
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["published-reviews-v1", namespace], {
      revalidate: 60, tags: [`published-reviews:${namespace}`],
    });
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
