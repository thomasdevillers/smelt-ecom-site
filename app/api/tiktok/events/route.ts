import { after } from "next/server";
import { sendTikTokEvents, tiktokUser } from "@/lib/tiktokEvents";
import { tiktokCartParameters } from "@/lib/tiktok";
import { cartSubtotal, emptyCart } from "@/lib/cartReducer";
import { checkoutTotal } from "@/lib/checkoutShared";
import { COLOURS } from "@/lib/product";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Expected JSON" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 16000) return Response.json({ error: "Payload too large" }, { status: 413 });
  try {
    const body = JSON.parse(raw);
    if (!["ViewContent", "AddToCart", "InitiateCheckout"].includes(body.event) ||
        typeof body.event_id !== "string" || !/^[\w-]{1,128}$/.test(body.event_id)) {
      return Response.json({ error: "Invalid event" }, { status: 400 });
    }
    const url = new URL(body.url);
    if (url.origin !== new URL(request.url).origin) throw Error("Invalid URL");
    const contents = body.parameters?.contents;
    if (!Array.isArray(contents) || !contents.length || contents.length > 2) throw Error("Invalid contents");
    const cart = { ...emptyCart };
    for (const item of contents) {
      const colour = COLOURS.find((c) => item.content_id === `smelt-sauna-hat-${c}`);
      if (!colour || cart[colour] || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw Error("Invalid item");
      cart[colour] = item.quantity;
    }
    const event = {
      event: body.event, event_id: body.event_id, event_time: Math.floor(Date.now() / 1000),
      page: { url: `${url.origin}${url.pathname}` }, user: tiktokUser(body.user, request),
      properties: tiktokCartParameters(cart, body.event === "InitiateCheckout" ? checkoutTotal(cart) : cartSubtotal(cart)),
    };
    after(async () => { await sendTikTokEvents([event]); });
    return Response.json({ accepted: true }, { status: 202 });
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
}
