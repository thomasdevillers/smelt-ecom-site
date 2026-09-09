import { after } from "next/server";
import { sendOrderConfirmation, logOrderConfirmationFailure } from "@/lib/orderConfirmation";
import { sendTikTokPurchase } from "@/lib/tiktokEvents";
import type { TikTokClientContext } from "@/lib/tiktok";
import crypto from "node:crypto";
import type { OrderItem } from "@/lib/orderTypes";
import { sendPaymentFailedEmail } from "@/lib/email";
import { checkoutTotal, sanitizeCart } from "@/lib/checkoutShared";
import { sendMetaPurchase } from "@/lib/metaConversions";
import type { MetaClientContext } from "@/lib/meta";

// node:crypto requires the Node.js runtime, not edge.
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
    console.error("Paystack webhook secret is missing");
    return new Response("webhook not configured", { status: 503 });
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
        metaClient?: MetaClientContext;
        tiktokClient?: TikTokClientContext;
        shippingAddress?: { phone?: unknown };
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

    // `metadata` came from the browser when it opened the Paystack widget, so
    // it's untrusted. Recompute the expected total from the cart with the
    // same pricing logic the UI uses, and compare against the amount
    // Paystack actually confirms was charged (`d.amount`) rather than
    // whatever amountRand the client claims in metadata.
    const cart = sanitizeCart(d.metadata?.cart);
    const expectedAmountRand = checkoutTotal(cart);
    const amountMatches = expectedAmountRand > 0 && d.amount === expectedAmountRand * 100 && d.currency === "ZAR";

    if (!amountMatches) {
      console.error(
        `Paystack webhook amount mismatch for ${d.reference}: paid R${paidAmountRand}, cart totals R${expectedAmountRand}`,
      );
      // Paystack remains the payment record. Acknowledge the event so it does
      // not retry indefinitely; the mismatched transaction needs manual review.
      return new Response("ok", { status: 200 });
    }

    if (d.currency === "ZAR" && paidAmountRand > 0) {
      after(() => sendTikTokPurchase({
        reference: d.reference ?? "", email: d.customer?.email ?? "",
        phone: d.metadata?.shippingAddress?.phone, amount: paidAmountRand, currency: d.currency!,
        cart, paidAt: d.paid_at, client: d.metadata?.tiktokClient,
      }));
    }
    try {
      await sendOrderConfirmation({
        reference: d.reference ?? "", email: d.customer?.email ?? "",
        amount: d.amount!, currency: d.currency!, cart, address: d.metadata?.shippingAddress,
      });
    } catch (error) {
      logOrderConfirmationFailure(d.reference ?? "", error);
      // Do not acknowledge lost mail: Paystack retries this authenticated payment event.
      return new Response("order confirmation pending", { status: 503 });
    }
    console.log(`Confirmed Paystack order: ${d.reference}`);
    // Meta deduplicates repeated webhook deliveries by the Paystack reference,
    // which is used as event_id in buildMetaPurchaseEvent.
    await sendMetaPurchase({
      reference: d.reference ?? "",
      email: d.customer?.email ?? "",
      amount: paidAmountRand,
      currency: d.currency ?? "ZAR",
      items,
      paidAt: d.paid_at,
      client: d.metadata?.metaClient,
    });
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
