import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), eval: vi.fn(), zcard: vi.fn(), zrange: vi.fn(), hgetall: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("./admin/store", async importOriginal => ({ ...await importOriginal<typeof import("./admin/store")>(), adminStore: () => mocks }));
import { GET } from "@/app/api/admin/conversations/route";
import { AdminError } from "./admin/store";
import { beginHatTurn, finishHatTurn, getHatConversation, listHatConversations } from "./hatConversations.server";
const id = "12345678-1234-4123-8123-123456789abc";
const meta = { id, firstQuestion: "Fit?", startedAt: "2026-11-07T10:00:00.000Z", updatedAt: "2026-11-07T10:01:00.000Z", turnCount: "12" };
const request = (query = "") => new Request(`https://saunahat.co.za/api/admin/conversations${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(undefined);
  mocks.zcard.mockResolvedValue(21);
  mocks.zrange.mockResolvedValue([id]);
  mocks.hgetall.mockResolvedValue(meta);
  mocks.eval.mockResolvedValue(1);
});
describe("private conversation access", () => {
  it("requires an admin session before reading the list or a transcript", async () => {
    mocks.auth.mockRejectedValue(new AdminError("Please sign in to continue.", 401));
    for (const query of ["", `?id=${id}`]) expect((await GET(request(query))).status).toBe(401);
    expect(mocks.hgetall).not.toHaveBeenCalled();
    expect(mocks.zcard).not.toHaveBeenCalled();
  });
  it("returns private uncached paginated summaries", async () => {
    const response = await GET(request("?page=2"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ page: 2, pageCount: 2, total: 21, conversations: [{ ...meta, turnCount: 12 }] });
    expect(mocks.zrange).toHaveBeenCalledWith(expect.any(String), 20, 39, { rev: true });
    expect(mocks.hgetall.mock.calls.every(([key]) => key.endsWith(":meta"))).toBe(true);
  });
  it.each(["?page=0", "?page=1.5", "?page=NaN", "?id=bad"])("rejects invalid queries %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.hgetall).not.toHaveBeenCalled();
    expect(mocks.zcard).not.toHaveBeenCalled();
  });
  it("returns 404 for missing conversations", async () => {
    mocks.hgetall.mockResolvedValue(null);
    expect((await GET(request(`?id=${id}`))).status).toBe(404);
  });
});
describe("transcript storage", () => {
  it("keeps all exchanges beyond the model history window and orders them by insertion", async () => {
    const turns = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), { id: String(i), sequence: 12 - i, question: `Question ${12 - i}`, status: "pending" }]));
    mocks.hgetall.mockResolvedValueOnce(meta).mockResolvedValueOnce(turns);
    const result = await getHatConversation(id);
    expect(result?.turns).toHaveLength(12);
    expect(result?.turns.map(turn => turn.sequence)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
  it("uses environment-isolated keys and atomically inserts each pending question", async () => {
    const turn = await beginHatTurn(id, "Fit?");
    expect(turn).toMatchObject({ sequence: 1, question: "Fit?", status: "pending" });
    const [, keys, args] = mocks.eval.mock.calls[0];
    expect(keys).toHaveLength(3);
    expect(keys[1]).toContain(`:${id}:meta`);
    expect(JSON.parse(args[4])).toMatchObject({ id: turn.id, question: "Fit?", status: "pending" });
    await finishHatTurn(id, turn, { answer: { answer: "One size.", sources: ["fit"], needsHuman: false } });
    expect(JSON.parse(mocks.eval.mock.calls[1][2][1])).toMatchObject({ id: turn.id, sequence: 1, status: "answered", answer: { answer: "One size." } });
  });
  it("clamps pages after the end of the list", async () => {
    expect((await listHatConversations(100)).page).toBe(2);
    expect(mocks.zrange).toHaveBeenCalledWith(expect.any(String), 20, 39, { rev: true });
  });
});
