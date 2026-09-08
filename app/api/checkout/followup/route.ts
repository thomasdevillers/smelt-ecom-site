import { followupConfigured, parseFollowup, saveFollowup } from "@/lib/checkoutFollowup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!followupConfigured()) return new Response(null, { status: 204 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 4096) return new Response(null, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const lead = parseFollowup(body);
  if (!lead) return new Response(null, { status: 400 });
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const saved = await saveFollowup(lead, ip);
    return new Response(null, { status: saved ? 204 : 429 });
  } catch {
    console.error("Checkout follow-up capture unavailable");
    return new Response(null, { status: 503 });
  }
}
