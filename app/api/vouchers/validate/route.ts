import { AdminError, adminStore, digest, requireSameOrigin } from "@/lib/admin/store";
import { validateVoucher } from "@/lib/vouchers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("Expected JSON.", 415);
    const raw = await request.text();
    if (raw.length > 1024) throw new AdminError("Request is too large.", 413);
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { throw new AdminError("Invalid request."); }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `smelt:vouchers:v1:validate-rate:${digest(ip)}`;
    const allowed = await adminStore().eval<unknown[], number>(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
return count <= 30 and 1 or 0`, [key], []);
    if (!allowed) throw new AdminError("Too many voucher attempts. Please try again later.", 429);
    return Response.json(await validateVoucher(body.code, body.email), { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    if (error instanceof AdminError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Voucher validation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Voucher validation is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
