import { timingSafeEqual } from "node:crypto";
import { processReviewRequests, reviewRequestsConfigured, reviewRequestsEnabled } from "@/lib/reviewAutomation";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  if (!reviewRequestsEnabled()) return Response.json({ enabled: false });
  if (!reviewRequestsConfigured()) return Response.json({ error: "Review request configuration is incomplete." }, { status: 503 });
  try { return Response.json(await processReviewRequests(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Review requests could not be processed." }, { status: 503 }); }
}
