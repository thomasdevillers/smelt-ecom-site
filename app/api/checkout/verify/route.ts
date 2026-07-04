import { isPaystackConfigured, verifyTransaction } from "@/lib/paystack";
import { recordOrder, type OrderItem } from "@/lib/orders";
import { sendOrderEmails } from "@/lib/email";

// pg requires the Node.js runtime.
export const runtime = "nodejs";

// Called by the success page after Paystack redirects back with ?reference=...
// Confirms with Paystack directly (server-to-server) that the payment succeeded.
export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference) {
    return Response.json({ error: "Missing reference." }, { status: 400 });
  }

  if (!isPaystackConfigured()) {
    return Response.json({ configured: false }, { status: 503 });
  }

  try {
    const result = await verifyTransaction(reference);

    // Persist on success too. The webhook is the primary writer, but recording
    // here as well means orders are captured even before the webhook is set up.
    // recordOrder upserts by reference, so double-writes are harmless.
    if (result.status === "success") {
      const meta = result.metadata ?? {};
      const items = (meta.items as OrderItem[]) ?? [];
      const amountRand =
        (typeof meta.amountRand === "number" ? meta.amountRand : null) ??
        Math.round(result.amount / 100);
      try {
        const newlyPaid = await recordOrder({
          reference: result.reference,
          email: result.customerEmail ?? "",
          amountRand,
          currency: result.currency,
          status: result.status,
          items,
          paidAt: result.paidAt,
        });
        // recordOrder returns true only for whichever path (this or the webhook)
        // records the payment first, so the emails fire exactly once.
        if (newlyPaid) {
          await sendOrderEmails({
            reference: result.reference,
            email: result.customerEmail ?? "",
            amountRand,
            items,
          });
        }
      } catch (err) {
        // Non-fatal: the customer still gets confirmation; the webhook will
        // reconcile persistence. Just log it.
        console.error("Order persist (verify) error:", err);
      }
    }

    return Response.json({
      configured: true,
      paid: result.status === "success",
      status: result.status,
      reference: result.reference,
      amountRand: Math.round(result.amount / 100),
      email: result.customerEmail,
    });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return Response.json({ error: "Could not verify payment." }, { status: 502 });
  }
}
