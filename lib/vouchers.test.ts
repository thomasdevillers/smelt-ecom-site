import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const db = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); return "OK"; }),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      if (script.includes("local count = redis.call('INCR'")) return 1;
      const raw = values.get(keys[0]);
      const record = typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
      if (script.includes("voucher.heldBy = ARGV[3]")) {
        if (!record || record.email !== args[0] || record.expiresAt <= args[1] || record.redeemedAt || (record.heldBy && record.heldBy !== args[2])) return -1;
        record.heldBy = args[2]; record.heldAt = args[1]; values.set(keys[0], record); values.set(keys[1], args[3]); return record.amount;
      }
      if (script.includes("voucher.redeemedBy = ARGV[1]")) {
        if (!record) return 0;
        if (record.redeemedAt) return record.redeemedBy === args[0] ? 1 : 0;
        if (record.heldBy !== args[0] || record.amount !== Number(args[1])) return 0;
        record.redeemedBy = args[0]; record.redeemedAt = args[2]; values.set(keys[0], record); values.delete(keys[1]); return 1;
      }
      if (script.includes("voucher.heldBy = cjson.null")) {
        if (!record || record.heldBy !== args[0] || record.redeemedAt) return 0;
        record.heldBy = null; record.heldAt = null; values.set(keys[0], record); values.delete(keys[1]); return 1;
      }
      return 0;
    }),
  };
  return { values, db };
});

vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return state.db; } } }));
import { commitVoucher, createReviewVoucher, releaseVoucherCodeReservation, reserveVoucher, validateVoucher } from "./vouchers";
import { POST as validateVoucherRoute } from "@/app/api/vouchers/validate/route";

beforeEach(() => {
  vi.clearAllMocks(); state.values.clear();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
});
afterEach(() => vi.unstubAllEnvs());

async function issued() {
  const voucher = createReviewVoucher(" Buyer@Example.com ", "review-1", new Date("2026-09-22T10:00:00.000Z"));
  state.values.set(voucher.voucherKey, voucher.record);
  return voucher;
}

describe("review vouchers", () => {
  it("is tied to the review email and expires after 90 days", async () => {
    const voucher = await issued();
    await expect(validateVoucher(voucher.reward.code.toLowerCase(), "buyer@example.com")).resolves.toMatchObject({ amount: 50, expiresAt: "2026-12-21T10:00:00.000Z" });
    await expect(validateVoucher(voucher.reward.code, "other@example.com")).rejects.toThrow("invalid");
  });

  it("atomically holds and redeems a voucher once", async () => {
    const voucher = await issued();
    const metadata = await reserveVoucher(voucher.reward.code, "buyer@example.com", "payment-1");
    await expect(validateVoucher(voucher.reward.code, "buyer@example.com")).rejects.toThrow("attached");
    await expect(commitVoucher("payment-1", metadata)).resolves.toBe(true);
    await expect(commitVoucher("payment-1", metadata)).resolves.toBe(true);
    await expect(commitVoucher("payment-2", metadata)).resolves.toBe(false);
  });

  it("releases only the matching rejected checkout hold", async () => {
    const voucher = await issued();
    await reserveVoucher(voucher.reward.code, "buyer@example.com", "payment-1");
    await releaseVoucherCodeReservation("payment-2", voucher.reward.code);
    await expect(validateVoucher(voucher.reward.code, "buyer@example.com")).rejects.toThrow("attached");
    await releaseVoucherCodeReservation("payment-1", voucher.reward.code);
    await expect(validateVoucher(voucher.reward.code, "buyer@example.com")).resolves.toMatchObject({ amount: 50 });
  });

  it("keeps voucher validation same-origin and returns no private record data", async () => {
    const voucher = await issued();
    const call = (origin: string) => validateVoucherRoute(new Request("https://saunahat.co.za/api/vouchers/validate", {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ code: voucher.reward.code, email: "buyer@example.com" }),
    }));
    expect((await call("https://evil.example")).status).toBe(403);
    const response = await call("https://saunahat.co.za");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: voucher.reward.code, amount: 50, expiresAt: voucher.reward.expiresAt });
  });
});
