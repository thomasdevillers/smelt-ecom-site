import crypto from "node:crypto";
import { recordOrder, type OrderItem } from "@/lib/orders";
import { sendOrderEmails, sendPaymentFailedEmail } from "@/lib/email";
import { markCartConverted } from "@/lib/carts";
import { type ShippingAddress } from "@/lib/address";
import { sanitizeCart } from "@/lib/checkoutShared";
import { cartSubtotal } from "@/lib/cartReducer";

// pg and node:crypto require the Node.js runtime, not edge.
export const runtime = "nodejs";

// Paystack webhook. This is the SOURCE OF TRUTH for payments: it fires
// server-to-server even if the customer closes the tab before the redirect.
//
// Paystack signs each event with HMAC-SHA512 of the raw request body, keyed by
// your secret key, in the `x-paystack-signature` header. We MUST verify the raw
// body (not a re-serialized object) for the signature to match.
//
// Configure the endpoint URL in the Paystack dashboard:
//   Settings -> API Keys & Webhooks -> Webhook URL
//   https://your-domain/api/paystack/webhook

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // Not live yet: acknowledge so Paystack doesn't retry, but do nothing.
    return new Response("ok", { status: 200 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto
    .createHmac("sha512", secret)
    .update(raw)
    .digest("hex");

  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  let event: {
    event?: string;
    data?: {
      reference?: string;
      status?: string;
      amount?: number;
      currency?: string;
      paid_at?: string | null;
      customer?: { email?: string };
      metadata?: {
        cart?: unknown;
        items?: OrderItem[];
        amountRand?: number;
        customerName?: string | null;
        shippingAddress?: ShippingAddress | null;
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (event.event === "charge.success" && event.data) {
    const d = event.data;
    const paidAmountRand = Math.round((d.amount ?? 0) / 100);
    const items = d.metadata?.items ?? [];
    const customerName = d.metadata?.customerName ?? null;
    const shippingAddress = d.metadata?.shippingAddress ?? null;

    // `metadata` came from the browser when it opened the Paystack widget, so
    // it's untrusted. Recompute the expected total from the cart with the
    // same pricing logic the UI uses, and compare against the amount
    // Paystack actually confirms was charged (`d.amount`) rather than
    // whatever amountRand the client claims in metadata.
    const cart = sanitizeCart(d.metadata?.cart);
    const expectedAmountRand = cartSubtotal(cart);
    const amountMatches = expectedAmountRand === paidAmountRand;

    try {
      if (!amountMatches) {
        console.error(
          `Paystack webhook amount mismatch for ${d.reference}: paid R${paidAmountRand}, cart totals R${expectedAmountRand}`,
        );
        await recordOrder({
          reference: d.reference ?? "",
          email: d.customer?.email ?? "",
          amountRand: paidAmountRand,
          currency: d.currency ?? "ZAR",
          status: "amount_mismatch",
          items,
          paidAt: d.paid_at ?? null,
          customerName,
          shippingAddress,
        });
        // Acknowledge so Paystack doesn't retry; a human needs to review this,
        // not a webhook retry loop.
        return new Response("ok", { status: 200 });
      }

      const newlyPaid = await recordOrder({
        reference: d.reference ?? "",
        email: d.customer?.email ?? "",
        amountRand: paidAmountRand,
        currency: d.currency ?? "ZAR",
        status: d.status ?? "success",
        items,
        paidAt: d.paid_at ?? null,
        customerName,
        shippingAddress,
      });

      if (newlyPaid) {
        console.log(`New paid order: ${d.reference} (${d.customer?.email})`);
        // Fire notifications once, on the first time we see this payment.
        // Email is best-effort: sendOrderEmails swallows its own failures, so a
        // mail hiccup won't cause a webhook retry / duplicate order.
        await sendOrderEmails({
          reference: d.reference ?? "",
          email: d.customer?.email ?? "",
          amountRand: paidAmountRand,
          items,
          customerName,
          shippingAddress,
        });
        await markCartConverted(d.customer?.email ?? "");
      }
    } catch (err) {
      // Return 500 so Paystack retries; we haven't persisted the order.
      console.error("Webhook persist error:", err);
      return new Response("persist failed", { status: 500 });
    }
  }

  if (event.event === "charge.failed" && event.data) {
    const d = event.data;
    try {
      await sendPaymentFailedEmail({
        email: d.customer?.email ?? "",
        items: d.metadata?.items ?? [],
      });
    } catch (err) {
      console.error("Payment-failed email error:", err);
    }
  }

  // Acknowledge all other events so Paystack stops retrying them.
  return new Response("ok", { status: 200 });
}
