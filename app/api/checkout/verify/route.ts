import { after } from "next/server";
import { tryOrderConfirmation } from "@/lib/orderConfirmation";
import { sendTikTokPurchase } from "@/lib/tiktokEvents";
import type { TikTokClientContext } from "@/lib/tiktok";
import { verifyTransaction } from "@/lib/paystack";
import type { OrderItem } from "@/lib/orderTypes";
import { checkoutTotal, sanitizeCart } from "@/lib/checkoutShared";
import { PRODUCT } from "@/lib/product";
import { type CartState } from "@/lib/cartReducer";
import { sendMetaPurchase } from "@/lib/metaConversions";
import type { MetaClientContext } from "@/lib/meta";

export async function POST(request: Request) {
  let body: {
    reference?: unknown;
    cart?: unknown;
    metaClient?: MetaClientContext;
    tiktokClient?: TikTokClientContext;
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
      tiktokClient?: TikTokClientContext;
      shippingAddress?: { phone?: unknown };
      items?: OrderItem[];
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
    const expectedAmountRand = checkoutTotal(cart);
    const paidAmountRand = Math.round(verified.amount / 100);
    const amountMatches = expectedAmountRand > 0 && verified.amount === expectedAmountRand * 100 && verified.currency === "ZAR";

    if (!amountMatches) {
      console.error(
        `Paystack amount mismatch for ${reference}: paid R${paidAmountRand}, cart totals R${expectedAmountRand}`,
      );
      return Response.json(
        {
          error:
            "We couldn't reconcile your payment with your order total. Your payment was received — please contact support with your reference so we can sort this out.",
        },
        { status: 409 },
      );
    }

    after(() => tryOrderConfirmation({
      reference: verified.reference, email: verified.customerEmail ?? "",
      amount: verified.amount, currency: verified.currency, cart, address: meta?.shippingAddress,
    }));
    after(() => sendTikTokPurchase({
      reference: verified.reference, email: verified.customerEmail ?? "",
      phone: meta?.shippingAddress?.phone, amount: paidAmountRand, currency: verified.currency,
      cart, paidAt: verified.paidAt, request, client: body.tiktokClient ?? meta?.tiktokClient,
    }));

    await sendMetaPurchase({
      reference,
      email: verified.customerEmail ?? "",
      amount: paidAmountRand,
      currency: verified.currency,
      items,
      paidAt: verified.paidAt,
      request,
      client: body.metaClient,
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

export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference) {
    return Response.json({ error: "A payment reference is required." }, { status: 400 });
  }

  try {
    const verified = await verifyTransaction(reference);
    if (verified.status !== "success") {
      return Response.json({ error: "Payment not completed." }, { status: 400 });
    }

    const meta = verified.metadata as {
      items?: OrderItem[]; cart?: unknown; tiktokClient?: TikTokClientContext;
      shippingAddress?: { phone?: unknown };
    } | null;
    const cart = sanitizeCart(meta?.cart);
    if (checkoutTotal(cart) * 100 !== verified.amount || checkoutTotal(cart) <= 0 || verified.currency !== "ZAR") {
      return Response.json({ error: "Payment total does not match the order." }, { status: 409 });
    }
    after(() => tryOrderConfirmation({
      reference: verified.reference, email: verified.customerEmail ?? "",
      amount: verified.amount, currency: verified.currency, cart, address: meta?.shippingAddress,
    }));
    after(() => sendTikTokPurchase({
      reference: verified.reference, email: verified.customerEmail ?? "",
      phone: meta?.shippingAddress?.phone, amount: Math.round(verified.amount / 100),
      currency: verified.currency, cart, paidAt: verified.paidAt,
      client: meta?.tiktokClient, request,
    }));
    return Response.json({
      paid: true,
      reference: verified.reference,
      amountRand: Math.round(verified.amount / 100),
      currency: verified.currency,
      items: (Object.keys(cart) as Array<keyof CartState>)
        .filter((colour) => cart[colour] > 0)
        .map((colour) => ({ colour, name: PRODUCT.variants[colour].name, qty: cart[colour] })),
    });
  } catch (err) {
    console.error("Paystack read verification error:", err);
    return Response.json(
      { error: "Could not verify payment. Please try again." },
      { status: 502 },
    );
  }
}
