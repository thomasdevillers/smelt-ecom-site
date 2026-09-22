export const runtime = "nodejs";

export async function GET(request: Request) {
  // Cancellation in the browser does not invalidate a Paystack payment link.
  // Keep its allocation until the provider can no longer accept payment.
  return Response.redirect(new URL("/checkout?payment=cancelled", request.url), 303);
}
