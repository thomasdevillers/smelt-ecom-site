import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversionAnalytics } from "./analytics";
import { captureTouch, mergeAttribution } from "../attribution";
import { GUIDES } from "@/content/guides";

const touchTime = Date.parse("2026-09-12T10:00:00Z");
const attribution = mergeAttribution(null, captureTouch(new URL("https://saunahat.co.za/product?utm_source=facebook&utm_medium=paid_social"), "", touchTime), touchTime);

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
        { reference: "current-1", status: "success", amount: 45000, currency: "ZAR", paid_at: "2026-09-12T10:00:00Z", metadata: { cart: { green: 1 }, attribution } },
        { reference: "current-1", status: "success", amount: 45000, currency: "ZAR", paid_at: "2026-09-12T10:00:00Z", metadata: { cart: { green: 1 }, attribution } },
        { reference: "current-2", status: "success", amount: 90000, currency: "ZAR", paid_at: "2026-09-14T10:00:00Z", metadata: { cart: { cream: 2 } } },
        { reference: "other-business", status: "success", amount: 200000, currency: "ZAR", paid_at: "2026-09-14T10:00:00Z", metadata: {} },
      ] });
      const filter = url.searchParams.get("filter");
      if (filter?.startsWith("requestPath in")) {
        const previous = url.searchParams.get("since")?.startsWith("2026-09-04");
        return url.searchParams.get("by") === "day"
          ? json({ data: [{ timestamp: previous ? "2026-09-05T00:00:00.000Z" : "2026-09-12T00:00:00.000Z", pageviews: previous ? 8 : 30, visitors: previous ? 4 : 12 }] })
          : json({ data: [
            { requestPath: `/articles/${GUIDES[0].slug}`, pageviews: previous ? 8 : 20, visitors: previous ? 4 : 10 },
            ...previous ? [] : [{ requestPath: `/articles/${GUIDES[1].slug}`, pageviews: 10, visitors: 7 }],
          ] });
      }
      const values = filter?.includes("ViewContent") ? [8, 15]
        : filter?.includes("AddToCart") ? [4, 6]
        : filter?.includes("InitiateCheckout") ? [2, 3]
        : filter?.includes("PaymentOpened") ? [2, 3]
        : filter?.includes("PaymentCancelled") ? [1, 1]
        : filter?.includes("CheckoutError") ? [1, 2]
        : [10, 20];
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
      previous: { start: "2026-09-04", end: "2026-09-10", visitors: 10, productViews: 8, addToCarts: 4, checkoutStarts: 2, paymentOpened: 2, paymentCancelled: 1, checkoutErrors: 1, orders: 1, revenue: 45000 },
      current: { start: "2026-09-11", end: "2026-09-17", visitors: 20, productViews: 15, addToCarts: 6, checkoutStarts: 3, paymentOpened: 3, paymentCancelled: 1, checkoutErrors: 2, orders: 2, revenue: 135000 },
    });
    expect(result.current.channels).toEqual([
      { channel: "unrecorded", orders: 1, revenue: 90000 },
      { channel: "meta", orders: 1, revenue: 45000 },
    ]);
    expect(result.previous.channels).toEqual([{ channel: "unrecorded", orders: 1, revenue: 45000 }]);
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    const vercelCalls = calls.filter(url => url.includes("api.vercel.com"));
    expect(vercelCalls).toHaveLength(18);
    expect(vercelCalls.find(url => url.includes("/visits/"))).toContain("requestPath+ne+%27%2Fadmin%27");
    expect(vercelCalls.every(value => new URL(value).searchParams.get("limit") === "100")).toBe(true);
    expect(new Set(vercelCalls.filter(value => !new URL(value).searchParams.get("filter")?.startsWith("requestPath in")).map(value => new URL(value).searchParams.get("since"))).size).toBe(2);
    expect(calls.find(url => url.includes("api.paystack.co"))).toContain("status=success");
  });

  it("reports article views and the combined audience without summing per-article readers", async () => {
    const result = await getConversionAnalytics(7, new Date("2026-09-17T10:00:00Z"));
    expect(result.articlesError).toBeNull();
    expect(result.articles).toMatchObject({ current: { views: 30, visitors: 12 }, previous: { views: 8, visitors: 4 } });
    expect(result.articles!.current.pages).toHaveLength(GUIDES.length);
    expect(result.articles!.current.pages[0]).toMatchObject({ title: GUIDES[0].h1, views: 20, visitors: 10 });
    expect(result.articles!.current.pages[1]).toMatchObject({ title: GUIDES[1].h1, views: 10, visitors: 7 });
    expect(result.articles!.current.pages.find(page => page.path === `/articles/${GUIDES[2].slug}`)).toMatchObject({ views: 0, visitors: 0 });
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input))).filter(url => url.searchParams.get("filter")?.startsWith("requestPath in"));
    expect(calls).toHaveLength(4);
    for (const url of calls) {
      expect(url.searchParams.get("filter")).not.toContain("'/articles'");
      for (const guide of GUIDES) expect(url.searchParams.get("filter")).toContain(`'/articles/${guide.slug}'`);
    }
    expect(calls.find(url => url.searchParams.get("since") === "2026-09-11T00:00:00.000Z")?.searchParams.get("until")).toBe("2026-09-17T23:59:59.999Z");
    expect(calls.find(url => url.searchParams.get("since") === "2026-09-04T00:00:00.000Z")?.searchParams.get("until")).toBe("2026-09-10T23:59:59.999Z");
  });

  it.each([json({ error: "unavailable" }, 503), json({ data: { pageviews: "30", visitors: 12 } }), json({ data: null })])("keeps sales available when article stats fail or are malformed", async response => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((...args) => new URL(String(args[0])).searchParams.get("filter")?.startsWith("requestPath in") ? Promise.resolve(response as Response) : original(...args));
    const result = await getConversionAnalytics(7, new Date("2026-09-17T10:00:00Z"));
    expect(result.current.orders).toBe(2);
    expect(result.articles).toBeNull();
    expect(result.articlesError).toBeTruthy();
  });

  it("returns genuine zeros for an empty period", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((...args) => {
      const url = new URL(String(args[0]));
      if (url.searchParams.get("filter")?.startsWith("requestPath in")) return Promise.resolve(json({ data: [] }) as Response);
      return original(...args);
    });
    const result = await getConversionAnalytics(7, new Date("2026-09-17T10:00:00Z"));
    expect(result.articles?.current).toMatchObject({ views: 0, visitors: 0 });
    expect(result.articles?.current.pages.every(page => page.views === 0 && page.visitors === 0)).toBe(true);
  });

  it("fails with a useful setup message before making provider requests", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
    await expect(getConversionAnalytics(28)).rejects.toThrow("access token and project ID");
  });
});
