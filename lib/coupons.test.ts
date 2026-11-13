import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const values = new Map<string, Record<string, unknown>>();
  const sets = new Map<string, Set<string>>();
  const read = (key: string) => structuredClone(values.get(key));
  const add = (key: string, value: string) => { if (!sets.has(key)) sets.set(key, new Set()); sets.get(key)!.add(value); };
  const db = {
    get: vi.fn(async (key: string) => read(key) ?? null),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    mget: vi.fn(async (...keys: string[]) => keys.map(key => read(key) ?? null)),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      if (script.includes("redis.call('EXISTS', KEYS[1])")) {
        if (values.has(keys[0])) return 0;
        values.set(keys[0], JSON.parse(args[0])); add(keys[1], args[1]); return 1;
      }
      const coupon = read(keys[0]);
      if (!coupon) return script.includes("return -1") ? -1 : 0;
      if (script.includes("coupon.active =")) {
        coupon.active = args[0] === "true"; values.set(keys[0], coupon); return 1;
      }
      const reservation = read(keys[1]);
      if (script.includes("coupon.held = coupon.held + 1")) {
        if (reservation) return reservation.id === args[0] && reservation.email === args[1] && reservation.status === "held" ? reservation.amount : -1;
        if (!coupon.active || Number(coupon.redeemed) + Number(coupon.held) >= Number(coupon.maxUses)) return -1;
        coupon.held = Number(coupon.held) + 1;
        values.set(keys[0], coupon); values.set(keys[1], { id: args[0], email: args[1], amount: coupon.amount, status: "held" }); return coupon.amount;
      }
      if (!reservation) return 0;
      if (script.includes("reservation.status = 'paid'")) {
        if (reservation.id !== args[0] || reservation.amount !== Number(args[1])) return 0;
        if (reservation.status === "paid") return 1;
        if (reservation.status !== "held") return 0;
        coupon.redeemed = Number(coupon.redeemed) + 1;
        reservation.status = "paid";
        add(keys[2], String(reservation.email)); coupon.uses = sets.get(keys[2])!.size;
      } else {
        if (reservation.status !== "held") return 0;
        reservation.status = "released";
      }
      coupon.held = Number(coupon.held) - 1;
      values.set(keys[0], coupon); values.set(keys[1], reservation); return 1;
    }),
  };
  return { values, sets, db };
});
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return state.db; } } }));
import { commitCoupon, createCoupon, findCoupon, listCoupons, releaseCoupon, reserveCoupon, setCouponActive } from "./coupons";
import { commitVoucher, parseVoucherMetadata, releaseVoucherReservation, reserveVoucher, validateVoucher } from "./vouchers";
import { paidCheckoutTotal } from "./checkoutShared";
import { PRICING_VERSION } from "./pricing";

beforeEach(() => {
  vi.clearAllMocks(); state.values.clear(); state.sets.clear();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test"); vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
});
afterEach(() => vi.unstubAllEnvs());

describe("limited-use coupons", () => {
  it("stores normalized codes, their amount and usage limit", async () => {
    await expect(createCoupon(" warm75 ", 75, 10)).resolves.toMatchObject({ code: "WARM75", amount: 75, maxUses: 10, uses: 0, held: 0, redeemed: 0 });
    expect(await listCoupons()).toHaveLength(1);
    await expect(createCoupon("warm75", 75, 10)).rejects.toThrow("already exists");
    await expect(validateVoucher("warm75", "")).resolves.toMatchObject({ code: "WARM75", amount: 75 });
  });
  it.each([["SMELT-ABCDEFGHIJKL", 50, 1], ["A", 50, 1], ["BAD!", 50, 1], ["OKAY", 0, 1], ["OKAY", 1.5, 1], ["OKAY", 50, 0], ["OKAY", 50, 1.5], ["OKAY", 50, "10"]])("rejects invalid creation values %j", async (code, amount, limit) => {
    await expect(createCoupon(code, amount, limit)).rejects.toThrow();
    expect(state.db.eval).not.toHaveBeenCalled();
  });
  it("holds the last use before payment and rejects additional reservations", async () => {
    await createCoupon("LASTONE", 75, 1);
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => reserveCoupon("LASTONE", `buyer${i}@example.com`, `ref${i}`)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(validateVoucher("LASTONE", "")).rejects.toThrow("no uses left");
    expect(await findCoupon("LASTONE")).toMatchObject({ held: 1, redeemed: 0 });
  });
  it("counts completed orders once across webhook and verification retries", async () => {
    await createCoupon("THANKYOU", 125, 2);
    const metadata = await reserveVoucher("THANKYOU", "BUYER@example.com", "ref1");
    expect(parseVoucherMetadata(metadata)).toEqual(metadata);
    expect(await reserveCoupon("THANKYOU", "buyer@example.com", "ref1")).toEqual(metadata);
    expect(await commitVoucher("wrong-ref", metadata)).toBe(false);
    expect(await commitVoucher("ref1", { ...metadata, amount: 126 })).toBe(false);
    expect(await commitVoucher("ref1", metadata)).toBe(true);
    expect(await commitVoucher("ref1", metadata)).toBe(true);
    await releaseVoucherReservation("ref1", metadata);
    expect(await findCoupon("THANKYOU")).toMatchObject({ held: 0, redeemed: 1, uses: 1 });
    const second = await reserveCoupon("THANKYOU", "buyer@example.com", "ref2");
    expect(await commitCoupon("ref2", second)).toBe(true);
    expect(await findCoupon("THANKYOU")).toMatchObject({ held: 0, redeemed: 2, uses: 1 });
    await expect(reserveCoupon("THANKYOU", "other@example.com", "ref3")).rejects.toThrow("no uses left");
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, "aramex", 125, 550, PRICING_VERSION)).toBe(515);
  });
  it("releases a rejected checkout once and makes its use available again", async () => {
    await createCoupon("RETRY", 50, 1);
    const metadata = await reserveCoupon("RETRY", "buyer@example.com", "ref1");
    await releaseCoupon("ref1"); await releaseCoupon("ref1");
    expect(await commitCoupon("ref1", metadata)).toBe(false);
    expect(await findCoupon("RETRY")).toMatchObject({ held: 0, redeemed: 0 });
    await expect(reserveCoupon("RETRY", "other@example.com", "ref2")).resolves.toMatchObject({ amount: 50 });
  });
  it("stops new uses of deactivated coupons without breaking an existing payment", async () => {
    await createCoupon("PAUSED", 50, 10);
    const metadata = await reserveCoupon("PAUSED", "buyer@example.com", "ref1");
    await setCouponActive("PAUSED", false);
    await expect(validateVoucher("PAUSED", "")).rejects.toThrow("inactive");
    await expect(reserveCoupon("PAUSED", "buyer@example.com", "ref2")).rejects.toThrow("inactive");
    expect(await commitCoupon("ref1", metadata)).toBe(true);
    await setCouponActive("PAUSED", true);
    await expect(validateVoucher("PAUSED", "")).resolves.toMatchObject({ amount: 50 });
  });
  it("rejects malformed payment metadata and separates live and test codes", async () => {
    expect(parseVoucherMetadata({ kind: "coupon", id: "a".repeat(64), amount: 0 })).toBeNull();
    expect(parseVoucherMetadata({ kind: "unknown", id: "a".repeat(64), amount: 50 })).toBeNull();
    await createCoupon("TESTONLY", 50, 2);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
    expect(await findCoupon("TESTONLY")).toBeNull();
    expect(await listCoupons()).toEqual([]);
  });
});
