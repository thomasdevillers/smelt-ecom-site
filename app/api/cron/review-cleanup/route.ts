import { timingSafeEqual } from "node:crypto";
import { cleanupReviewTemporaryState } from "@/lib/reviewCustomMaintenance";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  try {
    return Response.json(await cleanupReviewTemporaryState(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Review temporary state could not be cleaned up." }, { status: 503 });
  }
}
