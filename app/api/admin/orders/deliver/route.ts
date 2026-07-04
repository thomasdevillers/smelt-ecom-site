import { isAdminRequest } from "@/lib/adminAuth";
import { markDelivered } from "@/lib/orders";
import { sendDeliveredEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return new Response("unauthorized", { status: 401 });
  let b: { reference?: unknown };
  try {
    b = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }
  const reference = typeof b.reference === "string" ? b.reference : "";
  if (!reference) return Response.json({ ok: false, error: "reference is required." }, { status: 400 });

  const order = await markDelivered(reference);
  if (!order) return Response.json({ ok: false, error: "Order not found." }, { status: 404 });

  await sendDeliveredEmail({ email: order.email, name: order.customerName });
  return Response.json({ ok: true, order });
}
