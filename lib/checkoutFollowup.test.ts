import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { set: vi.fn(), get: vi.fn(), eval: vi.fn(), zrange: vi.fn(), zrem: vi.fn(), zadd: vi.fn() },
  send: vi.fn(), payment: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.db; } } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("./followupPaystack", () => ({ followupPaymentState: mocks.payment }));

import { FOLLOWUP_DELAY, followupMessage, parseFollowup, processFollowups, saveFollowup } from "./checkoutFollowup";
import { POST } from "../app/api/checkout/followup/route";
import { GET } from "../app/api/cron/checkout-followups/route";

const now = Date.now();
const input = { id: "a7f2c83c-c1a9-4567-9345-cc49a8f01234", email: " Buyer@Example.com ", name: "Buyer", cart: { green: 1, cream: 0 } };
const lead = parseFollowup(input, now - FOLLOWUP_DELAY - 1000)!;
const notice = {
  lead, startedAt: now, delivered: false,
  message: { from: "Smelt <orders@example.com>", to: "owner@example.com", subject: "Smelt: checkout ready for personal follow-up", text: followupMessage(lead) },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_FOLLOWUP_ENABLED", "true");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake");
  vi.stubEnv("CHECKOUT_FOLLOWUP_TO", "owner@example.com");
  vi.stubEnv("ORDER_FROM_EMAIL", "Smelt <orders@example.com>");
  vi.stubEnv("RESEND_API_KEY", "fake");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "fake");
  vi.stubEnv("CRON_SECRET", "a-test-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.db.set.mockResolvedValue("OK");
  mocks.db.get.mockResolvedValue(lead);
  mocks.db.zrange.mockResolvedValue([lead.id]);
  mocks.db.eval.mockImplementation(async (script: string) => script.includes("current.version") ? notice : 1);
  mocks.payment.mockResolvedValue("unpaid");
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("checkout follow-up capture", () => {
  it("normalizes identity and discards untrusted amounts and timestamps", () => {
    const parsed = parseFollowup({ ...input, createdAt: 0, total: 1 }, now)!;
    expect(parsed.email).toBe("buyer@example.com");
    expect(parsed.createdAt).toBe(now);
    expect(parsed).not.toHaveProperty("total");
  });
  it.each([{ email: "bad" }, { id: "../private" }, { cart: {} }])("rejects invalid input %s", (override) => {
    expect(parseFollowup({ ...input, ...override })).toBeNull();
  });
  it("does not save when rate-limited", async () => {
    mocks.db.eval.mockResolvedValue(0);
    expect(await saveFollowup(lead, "127.0.0.1")).toBe(false);
    expect(mocks.db.eval).toHaveBeenCalledTimes(1);
  });
  it("rejects cross-origin capture", async () => {
    const response = await POST(new Request("https://saunahat.co.za/api/checkout/followup", {
      method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" }, body: JSON.stringify(input),
    }));
    expect(response.status).toBe(403);
    expect(mocks.db.eval).not.toHaveBeenCalled();
  });
  it("remains inert when disabled", async () => {
    vi.stubEnv("CHECKOUT_FOLLOWUP_ENABLED", "false");
    expect((await POST(new Request("https://saunahat.co.za/api/checkout/followup", { method: "POST" }))).status).toBe(204);
    expect(mocks.db.eval).not.toHaveBeenCalled();
  });
});

describe("owner notifications", () => {
  it("sends to the owner only and records delivery", async () => {
    expect(await processFollowups()).toMatchObject({ alerted: 1 });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "owner@example.com" });
    expect(mocks.send.mock.calls[0][0].text).toContain("buyer@example.com");
    expect(mocks.db.set.mock.calls[1][1]).toMatchObject({ delivered: true });
  });
  it("does not notify before 30 minutes", async () => {
    mocks.db.get.mockResolvedValue({ ...lead, updatedAt: Date.now() });
    await processFollowups();
    expect(mocks.payment).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("suppresses purchases and defers pending transactions", async () => {
    mocks.payment.mockResolvedValueOnce("paid");
    expect(await processFollowups()).toMatchObject({ suppressed: 1 });
    mocks.payment.mockResolvedValueOnce("pending");
    expect(await processFollowups()).toMatchObject({ deferred: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps provider failures queued without sending", async () => {
    mocks.payment.mockRejectedValue(new Error("Unavailable"));
    expect(await processFollowups()).toMatchObject({ errors: 1 });
    expect(mocks.db.zadd).toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retries email failure with the same body and idempotency key", async () => {
    mocks.send.mockResolvedValueOnce({ error: { message: "Unavailable" } });
    expect(await processFollowups()).toMatchObject({ errors: 1 });
    expect(mocks.db.set).toHaveBeenCalledTimes(1); // Lock only; no delivered flag.
    vi.stubEnv("CHECKOUT_FOLLOWUP_TO", "changed-owner@example.com");
    expect(await processFollowups()).toMatchObject({ alerted: 1 });
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("does not send an already delivered notification again", async () => {
    mocks.db.eval.mockImplementation(async (script: string) => script.includes("current.version") ? { ...notice, delivered: true } : 1);
    expect(await processFollowups()).toMatchObject({ suppressed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("skips a lead changed during payment reconciliation", async () => {
    mocks.db.eval.mockImplementation(async (script: string) => script.includes("current.version") ? null : 1);
    await processFollowups();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("stops ambiguous retries before Resend's idempotency window expires", async () => {
    mocks.db.eval.mockImplementation(async (script: string) => script.includes("current.version") ? { ...notice, startedAt: now - 24 * 60 * 60 * 1000 } : 1);
    expect(await processFollowups()).toMatchObject({ errors: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not overlap another cron worker", async () => {
    mocks.db.set.mockResolvedValue(null);
    expect(await processFollowups()).toEqual({ busy: true });
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it("requires the cron bearer secret", async () => {
    expect((await GET(new Request("https://saunahat.co.za/api/cron/checkout-followups"))).status).toBe(401);
    expect(mocks.db.set).not.toHaveBeenCalled();
  });
});
