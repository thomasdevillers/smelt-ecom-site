import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const completed: Record<string, string> = {};
  const queued: string[] = [];
  const db = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && values.has(key)) return null;
      values.set(key, value); return "OK";
    }),
    hgetall: vi.fn(async () => completed),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      if (script.includes("SET', KEYS[1], ARGV[1], 'NX'")) {
        if (!values.has(keys[0])) values.set(keys[0], JSON.parse(args[0]));
        return values.get(keys[0]);
      }
      if (script.includes("redis.call('DEL', KEYS[1])")) { values.delete(keys[0]); return 1; }
      return 1;
    }),
    zrange: vi.fn(async () => [...queued]),
    zrem: vi.fn(async (_key: string, id: string) => { const index = queued.indexOf(id); if (index >= 0) queued.splice(index, 1); return 1; }),
  };
  return {
    values, completed, queued, db,
    send: vi.fn(), createInvitation: vi.fn(), hasInvite: vi.fn(), hasReview: vi.fn(),
  };
});

vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.db; } } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("./admin/orders", () => ({ completionKey: () => "orders:completed" }));
vi.mock("./reviewStore", () => ({
  createReviewInvitation: mocks.createInvitation,
  hasCurrentReviewInvitation: mocks.hasInvite,
  hasReviewForOrder: mocks.hasReview,
}));
import { processReviewRequests, processReviewRewards } from "./reviewAutomation";

beforeEach(() => {
  vi.clearAllMocks(); mocks.values.clear(); mocks.queued.splice(0); Object.keys(mocks.completed).forEach(key => delete mocks.completed[key]);
  Object.entries({
    UPSTASH_REDIS_REST_URL: "https://redis.example.com", UPSTASH_REDIS_REST_TOKEN: "test",
    PAYSTACK_SECRET_KEY: "sk_test_example", RESEND_API_KEY: "resend-test",
    ORDER_FROM_EMAIL: "Smelt <orders@saunahat.co.za>", SITE_URL: "https://saunahat.co.za",
  }).forEach(([key, value]) => vi.stubEnv(key, value));
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  mocks.createInvitation.mockResolvedValue({ token: "private-token", email: "buyer@example.com", suggestedName: "Tumi" });
  mocks.hasInvite.mockResolvedValue(false); mocks.hasReview.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("review outreach automation", () => {
  it("emails a personal review link ten days after completion and deduplicates it", async () => {
    const now = Date.parse("2026-09-22T10:00:00.000Z");
    mocks.completed["order-1"] = "2026-09-11T10:00:00.000Z";
    await expect(processReviewRequests(now)).resolves.toMatchObject({ sent: 1, errors: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com", subject: expect.stringContaining("R50") });
    expect(mocks.send.mock.calls[0][0].html).toContain("https://saunahat.co.za/review/private-token");
    await expect(processReviewRequests(now)).resolves.toMatchObject({ sent: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not replace a manually-created review invitation", async () => {
    mocks.completed["order-1"] = "2026-09-01T10:00:00.000Z";
    mocks.hasInvite.mockResolvedValue(true);
    await expect(processReviewRequests(Date.parse("2026-09-22T10:00:00.000Z"))).resolves.toMatchObject({ skipped: 1 });
    expect(mocks.createInvitation).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("advances past the first ten recorded orders on the next daily run", async () => {
    const now = Date.parse("2026-09-22T10:00:00.000Z");
    for (let index = 0; index < 12; index++) {
      mocks.completed[`order-${index}`] = new Date(Date.parse("2026-09-01T10:00:00.000Z") + index * 1000).toISOString();
    }
    await expect(processReviewRequests(now)).resolves.toMatchObject({ sent: 10 });
    await expect(processReviewRequests(now)).resolves.toMatchObject({ sent: 2 });
    expect(mocks.send).toHaveBeenCalledTimes(12);
  });

  it("retries queued voucher mail with the exact stored reward", async () => {
    mocks.queued.push("review-1");
    mocks.values.set("smelt:vouchers:v1:test:reward:review-1", {
      code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-12-21T10:00:00.000Z",
      reviewId: "review-1", email: "buyer@example.com", createdAt: "2026-09-22T10:00:00.000Z",
    });
    await expect(processReviewRewards()).resolves.toEqual({ sent: 1, errors: 0 });
    expect(mocks.send.mock.calls[0][0].html).toContain("SMELT-ABCDEFGHIJKL");
    expect(mocks.queued).toEqual([]);
  });
});
