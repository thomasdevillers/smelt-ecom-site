import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandleUploadOptions, HandleUploadPresignedOptions } from "@vercel/blob/client";

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), signedToken: vi.fn(), legacy: vi.fn(), presigned: vi.fn() }));
vi.mock("@/lib/reviewStore", () => ({ reservePhotoUpload: mocks.reserve }));
vi.mock("@vercel/blob", () => ({ issueSignedToken: mocks.signedToken }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.legacy, handleUploadPresigned: mocks.presigned }));

import { POST } from "./route";
import { AdminError } from "@/lib/admin/store";
import { REVIEW_MAX_PHOTO_BYTES, REVIEW_UPLOAD_PHOTO_TYPES } from "@/lib/reviews";

const pathname = "reviews/pending/invitation/photo.jpg";
const payload = { pathname, multipart: false, clientPayload: JSON.stringify({ token: "personal-token" }) };
const request = (body: unknown, origin = "https://saunahat.co.za") => new Request("https://saunahat.co.za/api/reviews/upload", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signedToken.mockResolvedValue({ token: "signed-token" });
  mocks.legacy.mockImplementation(async (options: HandleUploadOptions) => {
    await options.onBeforeGenerateToken(pathname, payload.clientPayload, false);
    return { type: "blob.generate-client-token", clientToken: "client-token" };
  });
  mocks.presigned.mockImplementation(async (options: HandleUploadPresignedOptions) => {
    await options.getSignedToken(pathname, payload.clientPayload, false);
    return { type: "blob.generate-presigned-url", presignedUrl: "signed-url" };
  });
});

describe("review photo upload authorization", () => {
  it.each(["blob.generate-client-token", "blob.generate-presigned-url"])("authorizes the invitation before issuing %s", async type => {
    const response = await POST(request({ type, payload }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.reserve).toHaveBeenCalledWith("personal-token", pathname);
    const limits = { allowedContentTypes: REVIEW_UPLOAD_PHOTO_TYPES, maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES, addRandomSuffix: false };
    if (type === "blob.generate-presigned-url") {
      expect(mocks.signedToken).toHaveBeenCalledWith(expect.objectContaining({ pathname, operations: ["put"], maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES }));
      const options = mocks.presigned.mock.calls[0][0] as HandleUploadPresignedOptions;
      expect((await options.getSignedToken(pathname, payload.clientPayload, false)).urlOptions).toMatchObject(limits);
    } else {
      const options = mocks.legacy.mock.calls[0][0] as HandleUploadOptions;
      expect(await options.onBeforeGenerateToken(pathname, payload.clientPayload, false)).toMatchObject(limits);
      expect(mocks.signedToken).not.toHaveBeenCalled();
    }
  });

  it("rejects foreign origins and malformed payloads before requesting upload authorization", async () => {
    expect((await POST(request({ type: "blob.generate-client-token", payload }, "https://evil.example"))).status).toBe(403);
    for (const body of [null, [], { type: "blob.generate-presigned-url" }, { type: "blob.generate-client-token", payload: { pathname: 1 } }])
      expect((await POST(request(body))).status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.signedToken).not.toHaveBeenCalled();
  });

  it.each(["blob.generate-client-token", "blob.generate-presigned-url"])("does not authorize %s for an invalid or used invitation", async type => {
    mocks.reserve.mockRejectedValue(new AdminError("This review link has already been used.", 409));
    expect((await POST(request({ type, payload }))).status).toBe(409);
    expect(mocks.signedToken).not.toHaveBeenCalled();
  });
});
