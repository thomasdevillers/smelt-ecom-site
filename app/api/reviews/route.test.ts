import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reviewStore", () => ({
  listPublishedReviews: vi.fn(),
  submitReview: vi.fn(),
}));

import { listPublishedReviews } from "@/lib/reviewStore";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("review preview fixtures", () => {
  it("returns labelled samples and their summary in development without reading the store", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await GET();
    const data = await response.json();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(data.reviews).toHaveLength(3);
    expect(data.reviews.every((review: { displayName: string }) => review.displayName.includes("sample review"))).toBe(true);
    expect(data.summary.total).toBe(3);
    expect(data.summary.average).toBe(4.7);
    expect(data.summary.distribution[4]).toBe(1);
    expect(listPublishedReviews).not.toHaveBeenCalled();
  });

  it.each(["production", "test"])("uses real published review data in %s, never samples", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const published = { reviews: [], sort: "newest" as const, summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
    vi.mocked(listPublishedReviews).mockResolvedValue(published);

    const response = await GET();

    expect(await response.json()).toEqual(published);
    expect(listPublishedReviews).toHaveBeenCalledOnce();
  });
});
