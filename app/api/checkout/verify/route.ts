import { verifyTransaction } from "@/lib/paystack";
import { recordOrder } from "@/lib/orders";
import { sanitizeCart } from "@/lib/checkoutShared";
import { sanitizeAddress } from "@/lib/address";
import { PRODUCT } from "@/lib/product";
import type { CartState } from "@/lib/cartReducer";

export async function POST(request: Request) {
  let body: {
    reference?: unknown;
    cart?: unknown;
    address?: unknown;
    name?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { reference } = body;
  if (typeof reference !== "string") {
    return Response.json(
      { error: "A valid transaction reference is required." },
      { status: 400 },
    );
  }

  try {
    const verified = await verifyTransaction(reference);
    if (verified.status !== "success") {
      return Response.json({ error: "Payment not completed." }, { status: 400 });
    }

    // The webhook is the source of truth, but we record the order here too
    // to give the user immediate feedback. The `recordOrder` function is
    // idempotent, so this is safe. We can pull the order details from the
    // metadata we passed to Paystack, which is more reliable than the client.
    const meta = verified.metadata as any;
    const items =
      meta?.items ??
      (
        Object.keys(sanitizeCart(body.cart)) as Array<keyof CartState>
      ).map((c) => ({
        colour: c,
        name: PRODUCT.variants[c].name,
        qty: cart[c],
      }));

    await recordOrder({
      reference,
      email: verified.customerEmail!,
      amountRand: verified.amount / 100, // convert from cents
      currency: verified.currency,
      status: verified.status,
      items,
      paidAt: verified.paidAt,
      customerName:
        meta?.customerName ?? (typeof body.name === "string" ? body.name.trim() : ""),
      shippingAddress: meta?.shippingAddress ?? sanitizeAddress(body.address),
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return Response.json(
      { error: "Could not verify payment. Please try again." },
      { status: 502 },
    );
  }
}
