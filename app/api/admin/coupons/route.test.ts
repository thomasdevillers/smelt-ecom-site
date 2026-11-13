import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), list: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/coupons", () => ({ createCoupon: mocks.create, listCoupons: mocks.list, setCouponActive: mocks.update }));
import { AdminError } from "@/lib/admin/store";
import { GET, PATCH, POST } from "./route";
const request = (method: string, body: unknown, origin = "https://saunahat.co.za") => new Request("https://saunahat.co.za/api/admin/coupons", {
  method, headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
});
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); });
describe("admin coupons API", () => {
  it("requires authentication for viewing and changing codes", async () => {
    mocks.auth.mockRejectedValue(new AdminError("Sign in required.", 401));
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST", { code: "WARM", amount: 50, maxUses: 10 }))).status).toBe(401);
    expect((await PATCH(request("PATCH", { code: "WARM", active: false }))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks cross-origin changes", async () => {
    expect((await POST(request("POST", {}, "https://evil.example"))).status).toBe(403);
    expect((await PATCH(request("PATCH", {}, "https://evil.example"))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("persists the chosen discount and usage limit and keeps responses private", async () => {
    mocks.create.mockResolvedValue({ code: "WARM", amount: 50, maxUses: 10 });
    const result = await POST(request("POST", { code: "WARM", amount: 50, maxUses: 10 }));
    expect(result.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("WARM", 50, 10);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await (await GET()).json()).toEqual({ coupons: [] });
    expect((await PATCH(request("PATCH", { code: "WARM", active: false }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("WARM", false);
  });
  it("returns validation and duplicate-code errors", async () => {
    mocks.create.mockRejectedValue(new AdminError("This coupon code already exists.", 409));
    expect((await POST(request("POST", { code: "WARM", amount: 50, maxUses: 10 }))).status).toBe(409);
  });
});
