import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), run: vi.fn(), handle: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/admin/emailAudit", () => ({ getEmailAudit: mocks.get, runEmailAudit: mocks.run, markEmailIssueHandled: mocks.handle }));
import { AdminError } from "@/lib/admin/store";
import { GET, PATCH, POST } from "./route";
import { GET as CRON } from "../../cron/email-audit/route";

const request = (method: string, body: unknown, origin = "https://saunahat.co.za") => new Request("https://saunahat.co.za/api/admin/email-audit", {
  method, headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
});
const report = { ranAt: "2026-11-16T06:00:00.000Z", checked: 3, issues: [{ reference: "smeltp-x" }] };
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(report); mocks.run.mockResolvedValue(report); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("admin email audit API", () => {
  it("requires authentication", async () => {
    mocks.auth.mockRejectedValue(new AdminError("Sign in required.", 401));
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST", { action: "run" }))).status).toBe(401);
    expect((await PATCH(request("PATCH", { reference: "smeltp-x" }))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("blocks cross-origin changes", async () => {
    expect((await POST(request("POST", { action: "run" }, "https://evil.example"))).status).toBe(403);
    expect((await PATCH(request("PATCH", { reference: "smeltp-x" }, "https://evil.example"))).status).toBe(403);
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("returns the latest report privately, re-runs on request and marks issues handled", async () => {
    const result = await GET();
    expect(await result.json()).toEqual({ report });
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await POST(request("POST", { action: "run" }))).status).toBe(200);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect((await POST(request("POST", { action: "other" }))).status).toBe(400);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect((await PATCH(request("PATCH", { reference: "smeltp-x" }))).status).toBe(200);
    expect(mocks.handle).toHaveBeenCalledWith("smeltp-x");
  });
});

describe("email audit cron", () => {
  it("runs only with the cron secret and returns counts, not customer data", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect((await CRON(new Request("https://example.com/api/cron/email-audit"))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
    const result = await CRON(new Request("https://example.com/api/cron/email-audit", { headers: { authorization: "Bearer test-secret" } }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ranAt: report.ranAt, checked: 3, issues: 1 });
  });
  it("returns 503 when the audit fails", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.run.mockRejectedValue(new Error("redis down"));
    expect((await CRON(new Request("https://example.com/api/cron/email-audit", { headers: { authorization: "Bearer test-secret" } }))).status).toBe(503);
  });
});
