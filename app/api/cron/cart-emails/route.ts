import { timingSafeEqual } from "node:crypto";
import { cartEmailsConfigured, cartEmailsEnabled, processCartEmails } from "@/lib/cartEmailSequence";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  if (!cartEmailsEnabled()) return Response.json({ enabled: false });
  if (!cartEmailsConfigured()) return Response.json({ error: "Cart email configuration is incomplete." }, { status: 503 });
  try { return Response.json(await processCartEmails(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Cart emails could not be processed; queued records will be retried." }, { status: 503 }); }
}
