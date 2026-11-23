import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/research/store", () => ({ researchStore: () => ({ list: mocks.list }) }));
import { AdminError } from "@/lib/admin/store";
import { GET } from "./route";
describe("private admin research results", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(undefined); mocks.list.mockResolvedValue({ responses: [], total: 0 }); });
  it("requires admin authentication before reading responses", async () => {
    mocks.auth.mockRejectedValue(new AdminError("Please sign in.", 401));
    expect((await GET(new Request("https://saunahat.co.za/api/admin/research"))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns private, uncached results with validated pagination", async () => {
    const response = await GET(new Request("https://saunahat.co.za/api/admin/research?page=-1"));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(1);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
