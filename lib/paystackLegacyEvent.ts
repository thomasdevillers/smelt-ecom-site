import { sendOrderNotifications, logOrderConfirmationFailure } from "./orderConfirmation";
import { sendPaymentFailedEmail } from "./email";
import { paidCheckoutTotal, sanitizeCart } from "./checkoutShared";
import { sendMetaPurchase } from "./metaConversions";
import { commitInventory } from "./inventory";
import { commitVoucher, parseVoucherMetadata } from "./vouchers";
import type { PaystackEvent } from "./paystackEvent";

/** Existing provider/Redis processing, shared during the staged migration. */
export async function handleLegacyPaystackEvent(event: PaystackEvent) {
  if (event.event === "charge.success" && event.data) {
    const d = event.data;
    const paidAmountRand = Math.round((d.amount ?? 0) / 100);
    const items = d.metadata?.items ?? [];
    const cart = sanitizeCart(d.metadata?.cart);
    const voucher = parseVoucherMetadata(d.metadata?.voucher);
    const expectedAmountRand = paidCheckoutTotal(cart, d.metadata?.shippingMethod, voucher?.amount ?? 0, d.metadata?.unitPrice, d.metadata?.pricingVersion);
    const amountMatches = expectedAmountRand > 0 && d.amount === expectedAmountRand * 100 && d.currency === "ZAR";
    if (!amountMatches) {
      console.error(`Paystack webhook amount mismatch for ${d.reference}: paid R${paidAmountRand}, cart totals R${expectedAmountRand}`);
      return new Response("ok", { status: 200 });
    }
    if (typeof d.metadata?.inventoryReservation === "string" || d.reference?.startsWith("smeltp-")) {
      try {
        const committed = d.metadata?.inventoryReservation === d.reference && await commitInventory(d.reference!, cart);
        if (!committed) return new Response("inventory reconciliation pending", { status: 503 });
      } catch {
        return new Response("inventory reconciliation pending", { status: 503 });
      }
    }
    try {
      if (!d.reference || !await commitVoucher(d.reference, d.metadata?.voucher)) return new Response("voucher reconciliation pending", { status: 503 });
    } catch {
      return new Response("voucher reconciliation pending", { status: 503 });
    }
    try {
      await sendOrderNotifications({
        reference: d.reference ?? "", email: d.customer?.email ?? "", customerName: d.metadata?.customerName, paidAt: d.paid_at,
        amount: d.amount!, currency: d.currency!, cart, address: d.metadata?.shippingAddress, shippingMethod: d.metadata?.shippingMethod,
        preorder: d.metadata?.preorder, voucher: d.metadata?.voucher, unitPrice: d.metadata?.unitPrice,
        pricingVersion: d.metadata?.pricingVersion, attribution: d.metadata?.attribution,
      });
    } catch (error) {
      logOrderConfirmationFailure(d.reference ?? "", error);
      return new Response("order confirmation pending", { status: 503 });
    }
    await sendMetaPurchase({ reference: d.reference ?? "", email: d.customer?.email ?? "", amount: paidAmountRand,
      currency: d.currency ?? "ZAR", items, paidAt: d.paid_at, client: d.metadata?.metaClient });
  }
  if (event.event === "charge.failed" && event.data) {
    try { await sendPaymentFailedEmail({ email: event.data.customer?.email ?? "", items: event.data.metadata?.items ?? [] }); }
    catch (err) { console.error("Payment-failed email error:", err); }
  }
  return new Response("ok", { status: 200 });
}
