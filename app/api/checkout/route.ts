import { tiktokUser } from "@/lib/tiktokEvents";
import { cartSubtotal, type CartState } from "@/lib/cartReducer";
import { PRODUCT } from "@/lib/product";
import { initializeTransaction, isPaystackConfigured } from "@/lib/paystack";
import { checkoutTotal, sanitizeCart } from "@/lib/checkoutShared";
import { parseShippingMethod } from "@/lib/pricing";
import { sanitizeAddress } from "@/lib/address";
import type { MetaClientContext } from "@/lib/meta";
import { createInventoryReservationId, releaseInventory, reserveInventory } from "@/lib/inventory";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: { shippingMethod?: unknown; email?: unknown; cart?: unknown; name?: unknown; address?: unknown; metaClient?: MetaClientContext; tiktokClient?: unknown };
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
  const amount = checkoutTotal(cart, shippingMethod);

  // Do not accept an order unless the live payment provider is configured.
  if (!isPaystackConfigured()) {
    return Response.json({ configured: false }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const reservationId = createInventoryReservationId();
  let reservation;
  try {
    reservation = await reserveInventory(cart, reservationId);
  } catch (error) {
    console.error("Inventory reservation failed:", error);
    return Response.json({ error: "We couldn't confirm stock right now. Please try again." }, { status: 503 });
  }
  if (!reservation.reserved) {
    const unavailable = (Object.keys(cart) as Array<keyof CartState>)
      .filter((colour) => cart[colour] > reservation.stock[colour])
      .map((colour) => PRODUCT.variants[colour].name);
    return Response.json(
      { error: `${unavailable.join(" and ") || "A selected colour"} is out of stock or has fewer hats left than requested.`, stock: reservation.stock },
      { status: 409 },
    );
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
        cancel_action: `${origin}/api/checkout/cancel?reservation=${encodeURIComponent(reservationId)}`,
        metaClient: body.metaClient,
        tiktokClient: tiktokUser(body.tiktokClient, request),
      },
    });
    return Response.json({ configured: true, authorizationUrl, reference });
  } catch (err) {
    try { await releaseInventory(reservationId); } catch (releaseError) {
      console.error("Inventory rollback failed:", releaseError);
    }
    console.error("Paystack initialize error:", err);
    return Response.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 },
    );
  }
}
