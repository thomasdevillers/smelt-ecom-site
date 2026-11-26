import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ persist: vi.fn(), legacy: vi.fn() }));
vi.mock("@/lib/payments/paystackEventWorker", () => ({ persistPaystackEvent: mocks.persist }));
vi.mock("@/lib/payments/paystackLegacyEvent", () => ({ handleLegacyPaystackEvent: mocks.legacy }));
const secret = "sk_test_synthetic",
  raw = JSON.stringify({
    event: "charge.success",
    data: { domain: "test", reference: "synthetic" },
  });
function request(body = raw, signature = createHmac("sha512", secret).update(body).digest("hex")) {
  return new Request("https://synthetic.invalid/api/paystack/webhook", {
    method: "POST",
    body,
    headers: { "x-paystack-signature": signature },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PAYSTACK_SECRET_KEY", secret);
  vi.stubEnv("PAYSTACK_EVENT_STORE", "postgres");
  vi.stubEnv("PAYSTACK_EVENT_PAUSED", "false");
  vi.stubEnv("VERCEL_ENV", "");
  mocks.persist.mockResolvedValue("event-id");
  mocks.legacy.mockResolvedValue(new Response("legacy"));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Paystack webhook acknowledgement boundary", () => {
  it("persists authenticated raw bytes before acknowledging, without inline effects", async () => {
    let persisted = false;
    mocks.persist.mockImplementation(async () => {
      await Promise.resolve();
      persisted = true;
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(persisted).toBe(true);
    expect(mocks.persist).toHaveBeenCalledWith("test", raw);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("returns retryable failure when durable persistence fails, never falling back", async () => {
    mocks.persist.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("rejects invalid signatures before JSON parsing or writes", async () => {
    for (const signature of ["", "z".repeat(128), "a".repeat(128), "é".repeat(128)]) {
      expect((await POST(request("invalid json", signature))).status).toBe(401);
    }
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("rejects signed malformed envelopes and explicit mode mismatches", async () => {
    for (const body of [
      "null",
      "[]",
      "{}",
      "broken",
      JSON.stringify({ event: "charge.success", data: { domain: "live" } }),
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("continues durable ingestion while the worker is paused", async () => {
    vi.stubEnv("PAYSTACK_EVENT_PAUSED", "true");
    expect((await POST(request())).status).toBe(200);
    expect(mocks.persist).toHaveBeenCalledOnce();
  });
  it("fails closed for invalid configuration, missing secret and hosted previews", async () => {
    vi.stubEnv("PAYSTACK_EVENT_STORE", "typo");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("PAYSTACK_EVENT_STORE", "postgres");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("PAYSTACK_EVENT_PAUSED", "typo");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("keeps the unconfigured deployment on its existing synchronous path", async () => {
    vi.stubEnv("PAYSTACK_EVENT_STORE", "");
    expect(await (await POST(request())).text()).toBe("legacy");
    expect(mocks.legacy).toHaveBeenCalledOnce();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
