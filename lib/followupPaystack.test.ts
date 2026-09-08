import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followupPaymentState } from "./followupPaystack";

const fetchMock = vi.fn();
const email = "buyer@example.com";
const payment = (status: string) => ({ status, customer: { email } });
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fake");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("follow-up payment reconciliation", () => {
  it("allows an alert for a customer who never reached Paystack", async () => {
    fetchMock.mockResolvedValue(respond({ status: false }, 404));
    expect(await followupPaymentState(email, Date.now())).toBe("unpaid");
  });
  it.each(["success", "reversed"])("suppresses outreach for %s payments", async (status) => {
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: { id: 42 } }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: [payment("failed"), payment(status)] }));
    expect(await followupPaymentState(email, Date.now())).toBe("paid");
    expect(String(fetchMock.mock.calls[1][0])).toContain("customer=42");
  });
  it.each(["pending", "processing", "ongoing", "new_unknown_status"])("defers %s payments", async (status) => {
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: { id: 42 } }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: [payment(status)] }));
    expect(await followupPaymentState(email, Date.now())).toBe("pending");
  });
  it("checks additional pages before declaring the checkout unpaid", async () => {
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: { id: 42 } }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: Array.from({ length: 100 }, () => payment("failed")) }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: [payment("success")] }));
    expect(await followupPaymentState(email, Date.now())).toBe("paid");
    expect(String(fetchMock.mock.calls[2][0])).toContain("page=2");
  });
  it("allows failed/abandoned payments", async () => {
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: { id: 42 } }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: [payment("failed"), payment("abandoned")] }));
    expect(await followupPaymentState(email, Date.now())).toBe("unpaid");
  });
  it("never treats provider failure as an unpaid checkout", async () => {
    fetchMock.mockResolvedValue(respond({ status: false }, 503));
    await expect(followupPaymentState(email, Date.now())).rejects.toThrow();
  });
  it("fails closed when Paystack returns another customer's data", async () => {
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: { id: 42 } }));
    fetchMock.mockResolvedValueOnce(respond({ status: true, data: [{ status: "failed", customer: { email: "other@example.com" } }] }));
    await expect(followupPaymentState(email, Date.now())).rejects.toThrow("identity");
  });
});
