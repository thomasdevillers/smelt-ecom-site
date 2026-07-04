import { findAbandonedCarts, stampReminded } from "@/lib/carts";
import { sendAbandonedCartEmail } from "@/lib/email";
import { formatMoney } from "@/lib/pricing";

// pg (via lib/carts) requires the Node.js runtime.
export const runtime = "nodejs";

// Carts idle at least this long are considered abandoned (4 hours).
const FOUR_HOURS_MIN = 240;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const carts = await findAbandonedCarts(FOUR_HOURS_MIN);
  let sent = 0;
  for (const c of carts) {
    await sendAbandonedCartEmail({
      email: c.email,
      name: c.name,
      items: c.items,
      total: formatMoney(c.amountRand),
    });
    await stampReminded(c.email);
    sent++;
  }
  return Response.json({ ok: true, sent });
}
