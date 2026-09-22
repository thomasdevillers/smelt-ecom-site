import { tiktokUser } from "@/lib/tiktokEvents";
import { cartSubtotal, type CartState } from "@/lib/cartReducer";
import { PRODUCT } from "@/lib/product";
import { initializeTransaction, isPaystackConfigured, PaystackInitializationRejected } from "@/lib/paystack";
import { discountedCheckoutTotal, sanitizeCart } from "@/lib/checkoutShared";
import { parseShippingMethod } from "@/lib/pricing";
import { sanitizeAddress } from "@/lib/address";
import type { MetaClientContext } from "@/lib/meta";
import { createInventoryReservationId } from "@/lib/inventory";
import { reservePurchase, getAvailability, releaseRejectedPurchase } from "@/lib/preorderStore";
import { localStockTest } from "@/lib/stockEnvironment";
import { releaseVoucherCodeReservation, releaseVoucherReservation, reserveVoucher, type VoucherMetadata } from "@/lib/vouchers";
import { AdminError } from "@/lib/admin/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: { shippingMethod?: unknown; email?: unknown; cart?: unknown; name?: unknown; address?: unknown; metaClient?: MetaClientContext; tiktokClient?: unknown; preorderConsent?: unknown; voucherCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Lowercase so the order + the abandoned-cart row + the Paystack round-trip
  // all key on the same address regardless of how the customer typed it.
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "A valid email is required." }, { status: 400 });
  }

  const customerName = typeof body.name === "string" ? body.name.trim() : "";
  const shippingAddress = sanitizeAddress(body.address);
  if (!shippingAddress.phone) {
    return Response.json(
      { error: "A contact phone number is required for delivery." },
      { status: 400 },
    );
  }

  const cart = sanitizeCart(body.cart);
  const subtotal = cartSubtotal(cart);
  if (subtotal <= 0) {
    return Response.json({ error: "Your bag is empty." }, { status: 400 });
  }
  const shippingMethod = parseShippingMethod(body.shippingMethod);
  if (!shippingMethod) {
    return Response.json({ error: "Please choose a valid shipping option." }, { status: 400 });
  }
  // Do not accept an order unless the live payment provider is configured.
  if (!isPaystackConfigured()) {
    return Response.json({ configured: false }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  if (localStockTest() && process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")) {
    return Response.json({ error: "Local stock testing is enabled. Use a Paystack test secret key to test payment; live payments are disabled in this mode." }, { status: 503 });
  }
  const reservationId = createInventoryReservationId().replace("smelt-", "smeltp-");
  let reservation;
  try {
    reservation = await reservePurchase(cart, reservationId, body.preorderConsent);
  } catch (error) {
    console.error("Inventory reservation failed:", error);
    return Response.json({ error: "We couldn't confirm stock right now. Please try again." }, { status: 503 });
  }
  if (!reservation.reserved) {
    return Response.json(
      { error: "Availability has changed. Review your bag and confirm any pre-order before paying.", stock: await getAvailability() },
      { status: 409 },
    );
  }
  let voucher: VoucherMetadata | undefined;
  if (typeof body.voucherCode === "string" && body.voucherCode.trim()) {
    try { voucher = await reserveVoucher(body.voucherCode, email, reservationId); }
    catch (error) {
      await releaseRejectedPurchase(reservationId).catch(releaseError => console.error("Unused stock allocation needs review", releaseError));
      await releaseVoucherCodeReservation(reservationId, body.voucherCode).catch(releaseError => console.error("Ambiguous voucher allocation needs review", releaseError));
      return Response.json({ error: error instanceof AdminError ? error.message : "We couldn't validate this voucher right now." }, { status: error instanceof AdminError ? error.status : 503 });
    }
  }
  const amount = discountedCheckoutTotal(cart, shippingMethod, voucher?.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    await releaseRejectedPurchase(reservationId).catch(error => console.error("Unused stock allocation needs review", error));
    if (voucher) await releaseVoucherReservation(reservationId, voucher).catch(error => console.error("Unused voucher allocation needs review", error));
    return Response.json({ error: "The order total could not be calculated." }, { status: 400 });
  }
  const items = (Object.keys(cart) as Array<keyof CartState>)
    .filter((c) => cart[c] > 0)
    .map((c) => ({ colour: c, name: PRODUCT.variants[c].name, qty: cart[c] }));

  try {
    const { authorizationUrl, reference } = await initializeTransaction({
      email,
      amount,
      callbackUrl: `${origin}/checkout/success`,
      reference: reservationId,
      metadata: {
        cart, items, amountRand: amount, customerName, shippingAddress, shippingMethod,
        inventoryReservation: reservationId,
        preorder: reservation.preorder,
        voucher,
        cancel_action: `${origin}/api/checkout/cancel?reservation=${encodeURIComponent(reservationId)}`,
        metaClient: body.metaClient,
        tiktokClient: tiktokUser(body.tiktokClient, request),
      },
    });
    return Response.json({ configured: true, authorizationUrl, reference });
  } catch (err) {
    if (err instanceof PaystackInitializationRejected) {
      try { await releaseRejectedPurchase(reservationId); }
      catch (error) { console.error('Rejected payment allocation needs review', error); }
      try { await releaseVoucherReservation(reservationId, voucher); }
      catch (error) { console.error("Rejected voucher allocation needs review", error); }
    }
    // A timeout can follow a successful provider initialization. Keep the hold
    // until the payment link is definitively unusable, so it cannot oversell.
    console.error("Paystack initialize error:", err);
    return Response.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 },
    );
  }
}
