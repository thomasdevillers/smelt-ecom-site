import { timingSafeEqual } from "node:crypto";
import { followupConfigured, processFollowups } from "@/lib/checkoutFollowup";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, { status: 401 });
  }
  if (!followupConfigured()) return Response.json({ enabled: false });
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.RESEND_API_KEY ||
      !process.env.ORDER_FROM_EMAIL || !process.env.CHECKOUT_FOLLOWUP_TO) {
    return Response.json({ error: "Follow-up notification configuration is incomplete" }, { status: 503 });
  }
  try {
    return Response.json(await processFollowups(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Follow-up check failed; queued records will be retried" }, { status: 503 });
  }
}
