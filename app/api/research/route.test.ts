import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ allow: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/research/store", () => ({ researchStore: () => store }));
import { POST } from "./route";

const input = { token: "ab".repeat(32), version: 1, revision: 1, completed: false, answers: { frequency: "About weekly" } };
const request = (body: unknown = input, origin = "https://saunahat.co.za") => new Request("https://saunahat.co.za/api/research", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("public research autosave", () => {
  beforeEach(() => { vi.clearAllMocks(); store.allow.mockResolvedValue(true); store.save.mockResolvedValue(1); });
  it("saves partial responses under a digest, never the browser token", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, revision: 1 });
    expect(store.save.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(store.save.mock.calls[0][0]).not.toBe(input.token);
    expect(store.save.mock.calls[0][1]).toEqual(input);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects cross-origin saves before touching the database", async () => {
    expect((await POST(request(input, "https://other.invalid"))).status).toBe(403);
    expect(store.allow).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized and invalid data", async () => {
    expect((await POST(request({ ...input, answers: { invalid: "value" } }))).status).toBe(400);
    expect((await POST(request({ ...input, answers: { comment: "a".repeat(25_000) } }))).status).toBe(413);
    const invalid = new Request("https://saunahat.co.za/api/research", { method: "POST", headers: { origin: "https://saunahat.co.za", "Content-Type": "application/json" }, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("enforces Postgres rate limits", async () => {
    store.allow.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("never reports saved when the database write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.save.mockRejectedValue(new Error("private database details"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database details");
    spy.mockRestore();
  });
});
