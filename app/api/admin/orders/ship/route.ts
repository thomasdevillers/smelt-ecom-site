import { isAdminRequest } from "@/lib/adminAuth";
import { markShipped } from "@/lib/orders";
import { sendShippingEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return new Response("unauthorized", { status: 401 });
  let b: { reference?: unknown; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown };
  try {
    b = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }
  const reference = typeof b.reference === "string" ? b.reference : "";
  const carrier = typeof b.carrier === "string" ? b.carrier.trim() : "";
  const trackingNumber = typeof b.trackingNumber === "string" ? b.trackingNumber.trim() : "";
  const trackingUrl = typeof b.trackingUrl === "string" && b.trackingUrl.trim() ? b.trackingUrl.trim() : undefined;
  if (!reference || !carrier || !trackingNumber) {
    return Response.json({ ok: false, error: "reference, carrier and trackingNumber are required." }, { status: 400 });
  }

  const order = await markShipped(reference, { carrier, trackingNumber, trackingUrl });
  if (!order) return Response.json({ ok: false, error: "Order not found." }, { status: 404 });

  await sendShippingEmail({
    email: order.email,
    name: order.customerName,
    carrier: order.trackingCarrier ?? "",
    trackingNumber: order.trackingNumber ?? "",
    trackingUrl: order.trackingUrl ?? undefined,
    items: order.items,
  });
  return Response.json({ ok: true, order });
}
