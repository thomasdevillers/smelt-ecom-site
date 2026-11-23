import { timingSafeEqual } from "node:crypto";
import { discoverPaystackOrders } from "@/lib/paystackEventWorker";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, supplied = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  try { return Response.json(await discoverPaystackOrders(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Provider discovery unavailable." }, { status: 503 }); }
}
