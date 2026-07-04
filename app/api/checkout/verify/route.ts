import { verifyTransaction } from "@/lib/paystack";
import { recordOrder, type OrderItem } from "@/lib/orders";
import { sendOrderEmails } from "@/lib/email";
import { markCartConverted } from "@/lib/carts";
import { sanitizeCart } from "@/lib/checkoutShared";
import { sanitizeAddress, type ShippingAddress } from "@/lib/address";
import { PRODUCT } from "@/lib/product";
import { cartSubtotal, type CartState } from "@/lib/cartReducer";

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

    // `metadata` is whatever the browser handed Paystack when it opened the
    // inline widget — treat it as untrusted input, same as `body`.
    const meta = verified.metadata as {
      cart?: unknown;
      items?: OrderItem[];
      customerName?: string | null;
      shippingAddress?: ShippingAddress | null;
    } | null;

    const cart = sanitizeCart(meta?.cart ?? body.cart);
    const items: OrderItem[] =
      meta?.items ??
      (Object.keys(cart) as Array<keyof CartState>).map((c) => ({
        colour: c,
        name: PRODUCT.variants[c].name,
        qty: cart[c],
      }));

    // Never trust the amount the browser told Paystack to charge — recompute
    // it from the cart with the same pricing logic the UI uses, and compare
    // against what Paystack actually confirms was paid. Without this check a
    // tampered client could pay for a cheap cart while claiming an expensive
    // one in `items`/`cart`.
    const expectedAmountRand = cartSubtotal(cart);
    const paidAmountRand = Math.round(verified.amount / 100);
    const amountMatches = expectedAmountRand === paidAmountRand;

    const customerName =
      meta?.customerName ?? (typeof body.name === "string" ? body.name.trim() : "");
    const shippingAddress = meta?.shippingAddress ?? sanitizeAddress(body.address);

    if (!amountMatches) {
      console.error(
        `Paystack amount mismatch for ${reference}: paid R${paidAmountRand}, cart totals R${expectedAmountRand}`,
      );
      await recordOrder({
        reference,
        email: verified.customerEmail ?? "",
        amountRand: paidAmountRand,
        currency: verified.currency,
        status: "amount_mismatch",
        items,
        paidAt: verified.paidAt,
        customerName,
        shippingAddress,
      });
      return Response.json(
        {
          error:
            "We couldn't reconcile your payment with your order total. Your payment was received — please contact support with your reference so we can sort this out.",
        },
        { status: 409 },
      );
    }

    // The webhook is the primary writer, but we also record (and, the first
    // time we see this reference paid, email) here. recordOrder upserts by
    // reference and only reports `newlyPaid` once, so whichever of this route
    // or the webhook gets there first fires the notification exactly once.
    const newlyPaid = await recordOrder({
      reference,
      email: verified.customerEmail ?? "",
      amountRand: paidAmountRand,
      currency: verified.currency,
      status: verified.status,
      items,
      paidAt: verified.paidAt,
      customerName,
      shippingAddress,
    });

    if (newlyPaid) {
      try {
        await sendOrderEmails({
          reference,
          email: verified.customerEmail ?? "",
          amountRand: paidAmountRand,
          items,
          customerName,
          shippingAddress,
        });
        await markCartConverted(verified.customerEmail ?? "");
      } catch (err) {
        // Non-fatal: the order is already recorded; just log it.
        console.error("Order email (verify) error:", err);
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return Response.json(
      { error: "Could not verify payment. Please try again." },
      { status: 502 },
    );
  }
}
