import { describe, expect, it, vi } from "vitest";
import { encodeReviewPhoto } from "./reviewPhotoEncoding";

function canvasReturning(...outputs: Array<Blob | null>) {
  return { toBlob: vi.fn((callback: BlobCallback) => callback(outputs.shift() ?? null)) };
}

describe("review photo encoding", () => {
  it("retains actual WebP output and its matching filename", async () => {
    const canvas = canvasReturning(new Blob(["webp"], { type: "image/webp" }));
    const file = await encodeReviewPhoto(canvas);
    expect(file.type).toBe("image/webp");
    expect(file.name).toMatch(/\.webp$/);
    expect(await file.text()).toBe("webp");
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
  });

  it("re-encodes Safari's silent PNG fallback as JPEG without relabelling the PNG", async () => {
    const canvas = canvasReturning(
      new Blob([new Uint8Array(4_000_000)], { type: "image/png" }),
      new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }),
    );
    const file = await encodeReviewPhoto(canvas);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/\.jpg$/);
    expect(file.size).toBe(300_000);
    expect(canvas.toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), "image/jpeg", .8);
  });

  it("reduces oversized compressed photos while keeping the real format", async () => {
    const canvas = canvasReturning(
      new Blob([new Uint8Array(900_000)], { type: "image/webp" }),
      new Blob([new Uint8Array(400_000)], { type: "image/webp" }),
    );
    expect((await encodeReviewPhoto(canvas)).size).toBe(400_000);
    expect(canvas.toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), "image/webp", .65);
  });

  it("does not mislabel a PNG when neither compressed format is available", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    await expect(encodeReviewPhoto(canvasReturning(png, png))).rejects.toThrow("could not prepare");
    await expect(encodeReviewPhoto(canvasReturning(null, null))).rejects.toThrow("could not prepare");
  });
});
