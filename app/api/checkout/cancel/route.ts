export const runtime = "nodejs";

export async function GET(request: Request) {
  // Cancellation in the browser does not invalidate a Paystack payment link.
  // The expiry job checks payment status after one hour before releasing it.
  return Response.redirect(new URL("/checkout?payment=cancelled", request.url), 303);
}
