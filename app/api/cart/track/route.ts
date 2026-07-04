import { sanitizeCart } from "@/lib/checkoutShared";
import { cartSubtotal, type CartState } from "@/lib/cartReducer";
import { PRODUCT } from "@/lib/product";
import { trackCart } from "@/lib/carts";

// pg (via trackCart) requires the Node.js runtime.
export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; name?: unknown; cart?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return Response.json({ ok: false }, { status: 400 });

  const cart = sanitizeCart(body.cart);
  const amount = cartSubtotal(cart);
  if (amount <= 0) return Response.json({ ok: true }); // nothing worth tracking

  const items = (Object.keys(cart) as Array<keyof CartState>)
    .filter((c) => cart[c] > 0)
    .map((c) => ({ colour: c as string, name: PRODUCT.variants[c].name, qty: cart[c] }));

  try {
    await trackCart({
      email,
      name: typeof body.name === "string" ? body.name.trim() : null,
      items,
      amountRand: amount,
    });
  } catch (err) {
    console.error("cart track failed:", err);
  }
  return Response.json({ ok: true });
}
