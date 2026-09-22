import { timingSafeEqual } from "node:crypto";
import { processReviewRewards, reviewRewardsConfigured } from "@/lib/reviewAutomation";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  if (!reviewRewardsConfigured()) return Response.json({ error: "Review reward configuration is incomplete." }, { status: 503 });
  try { return Response.json(await processReviewRewards(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Review rewards could not be processed." }, { status: 503 }); }
}
