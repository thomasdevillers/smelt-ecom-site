import { encodeReviewPhoto } from "@/lib/reviewPhotoEncoding";
import { CUSTOM_HAT_MAX_FILE_BYTES } from "@/lib/customHats/shared";

const BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  heic: "image/heic",
  heif: "image/heif",
};
const KEEP_AS_IS = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
]);
const MAX_EDGE = 2400;

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "logo";

/**
 * Makes sure the file we upload is one R2 will accept with a Content-Type that
 * matches its bytes. Logo files (PNG, JPEG, WebP, SVG, PDF) go up unchanged so
 * transparency and vector detail survive. Anything else that is an image (an
 * iPhone HEIC photo, an oversized phone photo, a file with no type) is redrawn
 * in the browser and encoded as WebP or JPEG, exactly like review photos.
 */
export async function prepareLogoFile(file: File): Promise<File> {
  // Some phones and file pickers leave the type empty; fall back to the extension.
  const type = file.type || BY_EXTENSION[extensionOf(file.name)] || "";
  if (
    KEEP_AS_IS.has(type) &&
    (file.size <= CUSTOM_HAT_MAX_FILE_BYTES ||
      type === "image/svg+xml" ||
      type === "application/pdf")
  )
    return type === file.type ? file : new File([file], file.name, { type });
  if (!type.startsWith("image/"))
    throw new Error("Logos must be SVG, PDF, PNG or JPEG files, or a photo.");

  const image = document.createElement("img");
  const source = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error("We couldn’t read this file. Export it as PNG, JPEG or PDF and try again."),
        );
      image.src = source;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("We couldn’t prepare this file. Please try a different one.");
    // JPEG has no transparency; a white background avoids a black one.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = await encodeReviewPhoto(canvas);
    const extension = encoded.type === "image/webp" ? "webp" : "jpg";
    return new File([encoded], `${baseName(file.name)}.${extension}`, { type: encoded.type });
  } finally {
    URL.revokeObjectURL(source);
  }
}
