import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const queue = new Map<string, number>();
  const db = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    exists: vi.fn(async (key: string) => values.has(key) ? 1 : 0),
    set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && values.has(key)) return null;
      values.set(key, value); return "OK";
    }),
    zrange: vi.fn(async (_key: string, _min: number, max: number) => [...queue.entries()].filter(([, score]) => score <= max).sort((a, b) => a[1] - b[1]).map(([id]) => id).slice(0, 10)),
    zadd: vi.fn(async (_key: string, value: { member: string; score: number }) => { queue.set(value.member, value.score); return 1; }),
    zrem: vi.fn(async (_key: string, id: string) => { queue.delete(id); return 1; }),
    eval: vi.fn(async (script: string, keys: string[], args: Array<string | number>) => {
      if (script.includes("if redis.call('EXISTS', KEYS[1])")) {
        if (values.has(keys[0])) return values.get(keys[0]);
        values.set(keys[1], JSON.parse(String(args[1])));
        values.set(keys[2], args[3]);
        values.set(keys[3], JSON.parse(String(args[5])));
        const campaign = JSON.parse(String(args[0])); values.set(keys[0], campaign); return campaign;
      }
      if (script.includes("campaign.nextStep ~= tonumber")) {
        const campaign = values.get(keys[0]) as Record<string, unknown>;
        if (args[4] === "1") { campaign.status = "completed"; queue.delete(String(args[0])); }
        else { campaign.nextStep = Number(campaign.nextStep) + 1; queue.set(String(args[0]), Number(args[3])); }
        campaign.nextDue = Number(args[3]); values.set(keys[0], campaign); return 1;
      }
      if (script.includes("campaign.status = ARGV[2]")) {
        const campaign = values.get(keys[0]) as Record<string, unknown> | undefined;
        if (campaign) { campaign.status = args[1]; values.set(keys[0], campaign); }
        queue.delete(String(args[0])); return 1;
      }
      if (script.includes("ARGV[1], 'NX', 'EX'")) {
        if (!values.has(keys[0])) values.set(keys[0], JSON.parse(String(args[0])));
        return values.get(keys[0]);
      }
      if (script.includes("redis.call('DEL', KEYS[1])")) { values.delete(keys[0]); return 1; }
      return 1;
    }),
  };
  return { values, queue, db, send: vi.fn(), payment: vi.fn(), voucher: vi.fn() };
});

vi.mock("./admin/store", async (original) => {
  const actual = await original<typeof import("./admin/store")>();
  return { ...actual, adminStore: () => mocks.db };
});
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("./followupPaystack", () => ({ followupPaymentState: mocks.payment }));
vi.mock("./vouchers", async (original) => {
  const actual = await original<typeof import("./vouchers")>();
  return { ...actual, createAbandonedCartVoucher: mocks.voucher };
});

import { followupRecordKey, type FollowupLead } from "./checkoutFollowup";
import { getCartRecovery, processCartEmails, unsubscribeCartEmails } from "./cartEmailSequence";

const now = Date.parse("2026-09-22T10:00:00.000Z");
const lead = (overrides: Partial<FollowupLead> = {}): FollowupLead => ({
  id: "a7f2c83c-c1a9-4567-9345-cc49a8f01234", email: "buyer@example.com", name: "Tumi",
  cart: { green: 1, cream: 0 }, stage: "details", createdAt: now - 2 * 60 * 60 * 1000,
  updatedAt: now - 60 * 60 * 1000, version: "lead-v1", marketingConsent: true,
  consentAt: new Date(now - 60 * 60 * 1000).toISOString(), consentVersion: "2026-09-22", ...overrides,
});

function queueLead(value: FollowupLead) {
  mocks.values.set(followupRecordKey(value.id), value);
  mocks.queue.set(value.id, now);
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.values.clear(); mocks.queue.clear();
  Object.entries({
    UPSTASH_REDIS_REST_URL: "https://redis.example.com", UPSTASH_REDIS_REST_TOKEN: "test",
    PAYSTACK_SECRET_KEY: "sk_test_example", RESEND_API_KEY: "resend-test",
    ORDER_FROM_EMAIL: "Smelt <orders@saunahat.co.za>", SITE_URL: "https://saunahat.co.za",
    CART_EMAIL_SEQUENCE_ENABLED: "true",
  }).forEach(([key, value]) => vi.stubEnv(key, value));
  mocks.payment.mockResolvedValue("unpaid");
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  mocks.voucher.mockImplementation((email: string, id: string) => ({
    voucherKey: `voucher:${id}`, ttl: 604800,
    record: { email, amount: 50 },
    reward: { code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-09-29T10:00:00.000Z" },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("abandoned-cart email sequence", () => {
  it("sends the first opted-in reminder and restores its private cart", async () => {
    queueLead(lead());
    await expect(processCartEmails(now)).resolves.toMatchObject({ sent: 1, errors: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com", subject: expect.stringContaining("R50") });
    expect(mocks.send.mock.calls[0][0].html).toContain("/checkout/recover/");
    expect(mocks.send.mock.calls[0][0].html).toContain("/email/unsubscribe/");
    const campaign = [...mocks.values.entries()].find(([key]) => key.includes(":campaign:"))?.[1] as { recoveryToken: string };
    await expect(getCartRecovery(campaign.recoveryToken)).resolves.toMatchObject({ email: "buyer@example.com", cart: { green: 1, cream: 0 } });
    await processCartEmails(now);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("spaces the three-message sequence and closes it after the final reminder", async () => {
    queueLead(lead());
    await processCartEmails(now);
    await processCartEmails(now + 22 * 60 * 60 * 1000);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await processCartEmails(now + 23 * 60 * 60 * 1000);
    await processCartEmails(now + 71 * 60 * 60 * 1000);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls.map(call => call[0].subject)).toEqual([
      "R50 off the Smelt you left behind",
      "Your R50 Smelt code is still warm",
      "A final reminder about your Smelt cart",
    ]);
    expect(mocks.queue.size).toBe(0);
  });

  it("never creates a campaign for a lead without explicit consent", async () => {
    queueLead(lead({ marketingConsent: false, consentAt: null, consentVersion: null }));
    await expect(processCartEmails(now)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mocks.payment).not.toHaveBeenCalled();
    expect(mocks.voucher).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rechecks Paystack and suppresses a completed payment before issuing an offer", async () => {
    queueLead(lead()); mocks.payment.mockResolvedValue("paid");
    await expect(processCartEmails(now)).resolves.toMatchObject({ paid: 1, sent: 0 });
    expect(mocks.voucher).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("persists an unsubscribe and stops the queued campaign", async () => {
    const value = lead(); queueLead(value);
    await processCartEmails(now);
    const campaign = [...mocks.values.entries()].find(([key]) => key.includes(":campaign:"))?.[1] as { unsubscribeToken: string };
    await expect(unsubscribeCartEmails(campaign.unsubscribeToken)).resolves.toBe(true);
    mocks.queue.set(value.id, now);
    await expect(processCartEmails(now)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
