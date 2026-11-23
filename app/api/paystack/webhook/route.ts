import { createHmac, timingSafeEqual } from "node:crypto";
import { parsePaystackEvent } from "@/lib/paystackEvent";
import { paystackEventConfig, paystackEnvironment } from "@/lib/paystackEventConfig";
import { handleLegacyPaystackEvent } from "@/lib/paystackLegacyEvent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new Response("webhook not configured", { status: 503 });
  // Authenticate the exact received bytes before parsing or persisting anything.
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  if (!/^[a-f0-9]{128}$/i.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")))
    return new Response("invalid signature", { status: 401 });
  let event;
  try { event = parsePaystackEvent(raw); }
  catch { return new Response("bad json", { status: 400 }); }
  try {
    if (paystackEventConfig().store === "postgres") {
      const environment = paystackEnvironment(secret);
      if (event.data?.domain !== undefined && event.data.domain !== environment) return new Response("invalid payment mode", { status: 400 });
      const { persistPaystackEvent } = await import("@/lib/paystackEventWorker");
      await persistPaystackEvent(environment, raw);
      // A processing pause never prevents durable ingestion of in-flight payments.
      return new Response("ok", { status: 200 });
    }
  } catch {
    // No Redis/in-memory fallback; Paystack must retry an unpersisted delivery.
    return new Response("event persistence unavailable", { status: 503 });
  }
  return handleLegacyPaystackEvent(event);
}
