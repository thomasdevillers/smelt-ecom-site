import { cartSubtotal, type CartState } from "@/lib/cartReducer";
import { PRODUCT } from "@/lib/product";
import { initializeTransaction, isPaystackConfigured } from "@/lib/paystack";
import { sanitizeCart } from "@/lib/checkoutShared";
import { sanitizeAddress } from "@/lib/address";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; cart?: unknown; name?: unknown; address?: unknown };
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

  const cart = sanitizeCart(body.cart);
  const amount = cartSubtotal(cart);
  if (amount <= 0) {
    return Response.json({ error: "Your bag is empty." }, { status: 400 });
  }

  // Payments not wired up yet: tell the client so it can stay in pre-order mode.
  if (!isPaystackConfigured()) {
    return Response.json({ configured: false }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const items = (Object.keys(cart) as Array<keyof CartState>)
    .filter((c) => cart[c] > 0)
    .map((c) => ({ colour: c, name: PRODUCT.variants[c].name, qty: cart[c] }));

  try {
    const { authorizationUrl, reference } = await initializeTransaction({
      email,
      amount,
      callbackUrl: `${origin}/checkout/success`,
      metadata: { items, amountRand: amount, customerName, shippingAddress },
    });
    return Response.json({ configured: true, authorizationUrl, reference });
  } catch (err) {
    console.error("Paystack initialize error:", err);
    return Response.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 },
    );
  }
}
