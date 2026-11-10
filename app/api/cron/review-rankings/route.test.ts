import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/reviewScoring", () => ({ processReviewRankings: vi.fn() }));
import { processReviewRankings } from "@/lib/reviewScoring";
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("review ranking cron", () => {
  it.each([undefined, "wrong", "Bearer wrong"])("rejects unauthorised calls: %s", async authorization => {
    vi.stubEnv("CRON_SECRET", "private-secret");
    expect((await GET(new Request("https://example.com/api/cron/review-rankings", { headers: authorization ? { authorization } : {} }))).status).toBe(401);
    expect(processReviewRankings).not.toHaveBeenCalled();
  });
  it("rejects calls when no cron secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.com"))).status).toBe(401);
  });
  it("processes authenticated batches without caching", async () => {
    vi.stubEnv("CRON_SECRET", "private-secret");
    vi.mocked(processReviewRankings).mockResolvedValue({ enabled: true, scored: 3, failed: 0 });
    const response = await GET(new Request("https://example.com", { headers: { authorization: "Bearer private-secret" } }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: true, scored: 3, failed: 0 });
  });
  it("returns a safe retryable error without internal details", async () => {
    vi.stubEnv("CRON_SECRET", "private-secret");
    vi.mocked(processReviewRankings).mockRejectedValue(new Error("private backend information"));
    const response = await GET(new Request("https://example.com", { headers: { authorization: "Bearer private-secret" } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private backend information");
  });
});
