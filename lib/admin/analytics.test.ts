import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversionAnalytics } from "./analytics";

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("conversion analytics", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "vercel-token");
    vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", "prj_smelt");
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_smelt");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "api.paystack.co") return json({ status: true, meta: { pageCount: 1 }, data: [
        { reference: "previous", status: "success", amount: 45000, currency: "ZAR", paid_at: "2026-09-05T10:00:00Z", metadata: { cart: { green: 1 } } },
        { reference: "current-1", status: "success", amount: 45000, currency: "ZAR", paid_at: "2026-09-12T10:00:00Z", metadata: { cart: { green: 1 } } },
        { reference: "current-1", status: "success", amount: 45000, currency: "ZAR", paid_at: "2026-09-12T10:00:00Z", metadata: { cart: { green: 1 } } },
        { reference: "current-2", status: "success", amount: 90000, currency: "ZAR", paid_at: "2026-09-14T10:00:00Z", metadata: { cart: { cream: 2 } } },
        { reference: "other-business", status: "success", amount: 200000, currency: "ZAR", paid_at: "2026-09-14T10:00:00Z", metadata: {} },
      ] });
      const filter = url.searchParams.get("filter");
      const values = filter?.includes("ViewContent") ? [8, 15] : filter?.includes("AddToCart") ? [4, 6] : filter?.includes("InitiateCheckout") ? [2, 3] : [10, 20];
      return json({ data: [
        { timestamp: "2026-09-05T00:00:00.000Z", visitors: values[0] },
        { timestamp: "2026-09-12T00:00:00.000Z", visitors: values[1] },
      ] });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("combines daily Vercel visitors with deduplicated successful Paystack orders", async () => {
    const result = await getConversionAnalytics(7, new Date("2026-09-17T10:00:00Z"));
    expect(result).toMatchObject({
      mode: "live", days: 7,
      previous: { start: "2026-09-04", end: "2026-09-10", visitors: 10, productViews: 8, addToCarts: 4, checkoutStarts: 2, orders: 1, revenue: 45000 },
      current: { start: "2026-09-11", end: "2026-09-17", visitors: 20, productViews: 15, addToCarts: 6, checkoutStarts: 3, orders: 2, revenue: 135000 },
    });
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    const vercelCalls = calls.filter(url => url.includes("api.vercel.com"));
    expect(vercelCalls).toHaveLength(8);
    expect(vercelCalls.find(url => url.includes("/visits/"))).toContain("requestPath+ne+%27%2Fadmin%27");
    expect(vercelCalls.every(value => new URL(value).searchParams.get("limit") === "100")).toBe(true);
    expect(new Set(vercelCalls.map(value => new URL(value).searchParams.get("since"))).size).toBe(2);
    expect(calls.find(url => url.includes("api.paystack.co"))).toContain("status=success");
  });

  it("fails with a useful setup message before making provider requests", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
    await expect(getConversionAnalytics(28)).rejects.toThrow("access token and project ID");
  });
});
