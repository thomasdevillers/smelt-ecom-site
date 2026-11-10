import { timingSafeEqual } from "node:crypto";
import { processReviewRankings } from "@/lib/reviewScoring";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  try { return Response.json(await processReviewRankings(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Review rankings could not be processed." }, { status: 503 }); }
}
