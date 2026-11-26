import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hgetall: vi.fn(),
  mget: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  hsetnx: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  adminStore: () => mocks,
}));
vi.mock("../payments/paystack", () => ({ verifyTransaction: mocks.verify }));
import { digest } from "./store";
import {
  getEmailAudit,
  markEmailIssueHandled,
  runEmailAudit,
  GRACE_PERIOD_MS,
  OWNER_EMAILS_SINCE,
} from "./emailAudit";

const now = Date.parse("2026-11-16T12:00:00.000Z");
const ref = (n: number) => `smeltp-${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const paid = (createdAt: string, extra = {}) => ({
  status: "paid",
  createdAt,
  green: 0,
  cream: 2,
  ...extra,
});
const accepted = { status: "accepted", id: "email" };
let receipts: Record<string, unknown>;
const confirmation = (reference: string) => `smelt:order-confirmation:v1:${digest(reference)}`;
const ownerKey = (reference: string) => `smelt:owner-order:v1:${digest(reference)}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  receipts = {};
  mocks.mget.mockImplementation(async (...keys: string[]) =>
    keys.map((key) => receipts[key] ?? null),
  );
  mocks.verify.mockImplementation(async (reference: string) => ({
    reference,
    status: "success",
    amount: 90000,
    currency: "ZAR",
    paidAt: "2026-11-14T09:00:40.000Z",
    customerEmail: "buyer@example.com",
    metadata: { customerName: " Nic " },
  }));
});

describe("email audit", () => {
  it("flags a paid order with no confirmation and enriches it from Paystack", async () => {
    mocks.hgetall.mockResolvedValue({ [ref(1)]: paid("2026-11-14T09:00:23.461Z") });
    const report = await runEmailAudit(now);
    expect(report).toEqual({
      ranAt: new Date(now).toISOString(),
      checked: 1,
      issues: [
        {
          reference: ref(1),
          createdAt: "2026-11-14T09:00:23.461Z",
          green: 0,
          cream: 2,
          customer: "missing",
          owner: "missing",
          email: "buyer@example.com",
          name: "Nic",
          amount: 90000,
          paidAt: "2026-11-14T09:00:40.000Z",
        },
      ],
    });
    expect(mocks.set).toHaveBeenCalledWith("smelt:email-audit:v1:test:latest", report);
  });

  it("passes orders whose customer and owner emails were both accepted", async () => {
    mocks.hgetall.mockResolvedValue({ [ref(1)]: paid("2026-11-14T09:00:00.000Z") });
    receipts[confirmation(ref(1))] = accepted;
    receipts[ownerKey(ref(1))] = accepted;
    expect((await runEmailAudit(now)).issues).toEqual([]);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("does not expect owner emails before they existed, but still checks the customer", async () => {
    const before = new Date(Date.parse(OWNER_EMAILS_SINCE) - 1).toISOString();
    mocks.hgetall.mockResolvedValue({
      [ref(1)]: paid(before),
      [ref(2)]: paid(before),
      [ref(3)]: paid(OWNER_EMAILS_SINCE),
    });
    receipts[confirmation(ref(1))] = accepted;
    receipts[confirmation(ref(3))] = accepted;
    const { issues } = await runEmailAudit(now);
    expect(issues.map((issue) => [issue.reference, issue.customer, issue.owner])).toEqual([
      [ref(2), "missing", null],
      [ref(3), "accepted", "missing"],
    ]);
  });

  it("reports sends that Resend never confirmed as pending", async () => {
    mocks.hgetall.mockResolvedValue({ [ref(1)]: paid("2026-11-14T09:00:00.000Z") });
    receipts[confirmation(ref(1))] = { status: "pending", startedAt: 1 };
    receipts[ownerKey(ref(1))] = accepted;
    expect((await runEmailAudit(now)).issues[0]).toMatchObject({
      customer: "pending",
      owner: "accepted",
    });
  });

  it("ignores unpaid orders and leaves recent orders for the next run", async () => {
    mocks.hgetall.mockResolvedValue({
      [ref(1)]: { ...paid("2026-11-14T09:00:00.000Z"), status: "held" },
      [ref(2)]: { ...paid("2026-11-14T09:00:00.000Z"), status: "expired" },
      [ref(3)]: paid(new Date(now - GRACE_PERIOD_MS + 1).toISOString()),
    });
    expect(await runEmailAudit(now)).toMatchObject({ checked: 0, issues: [] });
  });

  it("still reports an issue when the Paystack lookup fails or returns another reference", async () => {
    mocks.hgetall.mockResolvedValue({
      [ref(1)]: paid("2026-11-14T09:00:00.000Z"),
      [ref(2)]: paid("2026-11-14T10:00:00.000Z"),
    });
    mocks.verify.mockImplementation(async (reference: string) => {
      if (reference === ref(1)) throw new Error("timeout");
      return {
        reference: "other",
        status: "success",
        amount: 1,
        currency: "ZAR",
        paidAt: null,
        customerEmail: "x@example.com",
        metadata: null,
      };
    });
    const { issues } = await runEmailAudit(now);
    expect(issues).toHaveLength(2);
    issues.forEach((issue) => expect(issue.email).toBeUndefined());
  });

  it("checks receipts in batches for large ledgers", async () => {
    mocks.hgetall.mockResolvedValue(
      Object.fromEntries(
        Array.from({ length: 120 }, (_, i) => [ref(i), paid("2026-11-01T00:00:00.000Z")]),
      ),
    );
    for (let i = 0; i < 120; i++) {
      receipts[confirmation(ref(i))] = accepted;
      receipts[ownerKey(ref(i))] = accepted;
    }
    expect(await runEmailAudit(now)).toMatchObject({ checked: 120, issues: [] });
    expect(mocks.mget).toHaveBeenCalledTimes(3);
  });

  it("hides handled issues from the latest snapshot", async () => {
    mocks.get.mockResolvedValue({
      ranAt: "r",
      checked: 2,
      issues: [{ reference: ref(1) }, { reference: ref(2) }],
    });
    mocks.hgetall.mockResolvedValue({ [ref(1)]: "2026-11-16T10:00:00.000Z" });
    expect(await getEmailAudit()).toEqual({
      ranAt: "r",
      checked: 2,
      issues: [{ reference: ref(2) }],
    });
    mocks.get.mockResolvedValue(null);
    expect(await getEmailAudit()).toBeNull();
  });

  it("marks issues handled idempotently and rejects anything but an order reference", async () => {
    await markEmailIssueHandled(ref(1));
    await markEmailIssueHandled(ref(1));
    expect(mocks.hsetnx).toHaveBeenCalledTimes(2);
    expect(mocks.hsetnx).toHaveBeenCalledWith(
      "smelt:email-audit:v1:test:handled",
      ref(1),
      expect.any(String),
    );
    for (const bad of [undefined, "", "smelt-123", `${ref(1)}x`, { reference: ref(1) }]) {
      await expect(markEmailIssueHandled(bad)).rejects.toThrow("Invalid order reference.");
    }
    expect(mocks.hsetnx).toHaveBeenCalledTimes(2);
  });
});
