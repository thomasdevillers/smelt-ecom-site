import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), hasAdminSession: vi.fn(), getReviewPhoto: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
vi.mock("@/lib/admin/auth", () => ({ hasAdminSession: mocks.hasAdminSession }));
vi.mock("@/lib/reviewStore", () => ({ getReviewPhoto: mocks.getReviewPhoto }));

import { GET } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const photo = { url: "https://store_example.private.blob.vercel-storage.com/reviews/pending/invite/photo.webp", pathname: "reviews/pending/invite/photo.webp" };
const request = () => GET(new Request(`https://saunahat.co.za/api/reviews/photos/${id}/0`), { params: Promise.resolve({ id, index: "0" }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasAdminSession.mockResolvedValue(false);
  mocks.getReviewPhoto.mockResolvedValue(null);
  mocks.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response("photo bytes").body }));
});

describe("review photo delivery", () => {
  it("does not fetch pending or missing photos for visitors", async () => {
    expect((await request()).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.getReviewPhoto).toHaveBeenCalledTimes(1);
  });

  it("delivers an approved private photo and prevents caching across moderation changes", async () => {
    mocks.getReviewPhoto.mockResolvedValue(photo);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("photo bytes");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.get).toHaveBeenCalledWith(photo.url, expect.objectContaining({ access: "private", abortSignal: expect.any(AbortSignal) }));
    expect(mocks.hasAdminSession).not.toHaveBeenCalled();
  });

  it("allows an authenticated admin to preview pending photos", async () => {
    mocks.hasAdminSession.mockResolvedValue(true);
    mocks.getReviewPhoto.mockResolvedValueOnce(null).mockResolvedValueOnce(photo);
    expect((await request()).status).toBe(200);
    expect(mocks.getReviewPhoto).toHaveBeenLastCalledWith(id, 0, true);
  });

  it("retains support for previously uploaded public photos", async () => {
    const publicPhoto = { url: photo.url.replace(".private.", ".public.") };
    mocks.getReviewPhoto.mockResolvedValue(publicPhoto);
    expect((await request()).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(publicPhoto.url, expect.objectContaining({ access: "public" }));
  });

  it("serves JPEG fallback photos with the correct content type", async () => {
    mocks.getReviewPhoto.mockResolvedValue({ url: photo.url.replace(".webp", ".jpg"), pathname: photo.pathname.replace(".webp", ".jpg") });
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("returns a retryable failure when the upstream photo stream breaks", async () => {
    mocks.getReviewPhoto.mockResolvedValue(photo);
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.error(new Error("read ECONNRESET")); } }) });
    expect((await request()).status).toBe(503);
  });

  it("rejects a photo body larger than the permitted upload size", async () => {
    mocks.getReviewPhoto.mockResolvedValue(photo);
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new Response(new Uint8Array(5 * 1024 * 1024 + 1)).body });
    expect((await request()).status).toBe(503);
  });

  it("cancels a stalled upstream photo when its timeout expires", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const cancel = vi.fn();
    mocks.getReviewPhoto.mockResolvedValue(photo);
    mocks.get.mockImplementation(async () => ({ statusCode: 200, stream: new ReadableStream({
      pull() { controller.abort(new Error("Photo timed out")); }, cancel,
    }, { highWaterMark: 0 }) }));
    try {
      expect((await request()).status).toBe(503);
      expect(cancel).toHaveBeenCalledOnce();
    } finally { timeout.mockRestore(); }
  });
});
