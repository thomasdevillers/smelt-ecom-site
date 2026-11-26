import { AppError } from "../errors";

/** Limit bytes while streaming, not after allocating the entire request body. */
export async function readJsonObject(
  request: Request,
  limit = 16_384,
): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new AppError("Expected JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Invalid request body.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new AppError("Request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("Invalid request body.");
  }
}
