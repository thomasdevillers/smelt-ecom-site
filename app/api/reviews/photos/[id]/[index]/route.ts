import { get } from "@vercel/blob";
import { hasAdminSession } from "@/lib/admin/auth";
import { getReviewPhoto } from "@/lib/reviewStore";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

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
    const blob = await get(photo.url, { access: hostname.includes(".private.") ? "private" : "public" });
    if (!blob || blob.statusCode !== 200) return new Response(null, { status: 404, headers });
    return new Response(blob.stream, { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
