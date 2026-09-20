import { REVIEW_MAX_PHOTO_BYTES } from "./reviews";

// A browser may silently return PNG when it cannot encode WebP (e.g. Safari).
// Check the actual output type before choosing the filename and upload headers.
export async function encodeReviewPhoto(canvas: Pick<HTMLCanvasElement, "toBlob">): Promise<File> {
  const encode = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp", .8);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", .8);
  if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg"))
    throw new Error("We could not prepare this photo. Please try a different image.");

  // Keep unusually detailed images economical without reducing their dimensions.
  const type = blob.type;
  for (const quality of [.65, .5]) {
    if (blob.size <= 512 * 1024) break;
    const smaller = await encode(type, quality);
    if (smaller?.type === type && smaller.size < blob.size) blob = smaller;
  }
  if (blob.size > REVIEW_MAX_PHOTO_BYTES) throw new Error("This photo is still larger than 5 MB after resizing.");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${crypto.randomUUID()}.${extension}`, { type: blob.type });
}
