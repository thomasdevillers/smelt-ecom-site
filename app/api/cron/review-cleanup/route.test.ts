import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reviewCustomMaintenance", () => ({ cleanupReviewTemporaryState: cleanup }));
import { GET } from "./route";

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-secret"); });
afterEach(() => { vi.unstubAllEnvs(); });
const request = (secret = "synthetic-secret") => new Request("https://synthetic.invalid/api/cron/review-cleanup", { headers: { authorization: `Bearer ${secret}` } });

describe("review temporary-state cleanup authorization", () => {
  it("rejects missing or incorrect authorization before touching storage", async () => {
    expect((await GET(request("incorrect"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("returns aggregate results without caching", async () => {
    cleanup.mockResolvedValue({ enabled: true, invitations: 1, uploads: 2, retries: 3 });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: true, invitations: 1, uploads: 2, retries: 3 });
  });
  it("fails safely without exposing database errors", async () => {
    cleanup.mockRejectedValue(new Error("synthetic private details"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private details");
  });
});
