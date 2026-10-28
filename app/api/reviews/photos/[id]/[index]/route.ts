import { get } from "@vercel/blob";
import { hasAdminSession } from "@/lib/admin/auth";
import { getReviewPhoto } from "@/lib/reviewStore";
import { REVIEW_MAX_PHOTO_BYTES } from "@/lib/reviews";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function readPhoto(stream: ReadableStream<Uint8Array>, signal: AbortSignal) {
  signal.throwIfAborted();
  const reader = stream.getReader();
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > REVIEW_MAX_PHOTO_BYTES) throw new Error("Review photo exceeds the size limit.");
      chunks.push(value);
    }
    if (!size) throw new Error("Review photo is empty.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    signal.removeEventListener("abort", onAbort!);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await context.params;
    if (!/^[0-2]$/.test(index)) return new Response(null, { status: 404, headers });
    // Recheck moderation on every read, including after approval is revoked.
    let photo = await getReviewPhoto(id, Number(index));
    if (!photo && await hasAdminSession()) photo = await getReviewPhoto(id, Number(index), true);
    if (!photo) return new Response(null, { status: 404, headers });
    const hostname = new URL(photo.url).hostname;
    if (!/^[a-z0-9_-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i.test(hostname))
      return new Response(null, { status: 404, headers });
    const signal = AbortSignal.timeout(10_000);
    const blob = await get(photo.url, { access: hostname.includes(".private.") ? "private" : "public", abortSignal: signal });
    if (!blob || blob.statusCode !== 200) return new Response(null, { status: 404, headers });
    const contentType = /\.jpg(?:-[A-Za-z0-9_-]+)?$/i.test(photo.pathname) ? "image/jpeg" : "image/webp";
    // Finish reading inside the error boundary so a failed upstream stream
    // returns a retryable status instead of breaking an already-started 200.
    const bytes = await readPhoto(blob.stream, signal);
    return new Response(bytes, { headers: { ...headers, "Content-Type": contentType } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
