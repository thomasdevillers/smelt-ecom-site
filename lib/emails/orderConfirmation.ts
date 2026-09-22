import { parsePreorder, preorderTiming } from "../preorders";
import { SHIPPING_OPTIONS, type ShippingMethod } from "../pricing";
import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow, addressBlock } from "./components";
import { absoluteUrl, escapeHtml } from "./theme";
import type { OrderItem } from "../orderTypes";
import type { ShippingAddress } from "../address";

export function orderConfirmationEmail(d: {
  shippingMethod?: ShippingMethod;
  preorder?: unknown;
  reference: string; total: string; items: OrderItem[]; address?: ShippingAddress | null; discount?: number;
}): { subject: string; html: string; text: string } {
  const preorder = parsePreorder(d.preorder);
  const blocks = [
    `<p>Order reference: <strong>${escapeHtml(d.reference)}</strong></p>`,
    orderItemsTable(d.items),
    d.discount ? moneyRow("Review voucher", `−R${d.discount}`) : "",
    moneyRow("Total paid", d.total),
    `<p><strong>Shipping:</strong> ${SHIPPING_OPTIONS[d.shippingMethod ?? "aramex"].label}</p>`,
    d.address ? `<p><strong>Shipping to:</strong></p>${addressBlock(d.address)}` : "",
    preorder ? `<p><strong>Pre-order — paid in full.</strong> ${escapeHtml(preorderTiming(preorder))}</p><p>Your hats are reserved with priority over general restock sales. We’ll email you if timing changes. To cancel before dispatch for a full refund, contact hello@saunahat.co.za with your order reference.</p>` : d.shippingMethod === "founders"
      ? `<p>Your hat will be hand delivered by our founders on the next business day. We'll be in touch to coordinate your delivery.</p>`
      : `<p>Your hat is in stock. We'll be in touch with tracking as soon as it's on its way from Cape Town.</p>`,
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: preorder ? "Your Smelt pre-order is confirmed." : "Your Smelt order is confirmed.",
    heading: preorder ? "Your pre-order is confirmed" : "Your order is confirmed",
    intro: "Thanks for ordering a Smelt sauna hat.",
    blocks,
    cta: { label: "Visit Smelt", url: absoluteUrl("/") },
  });
  return { subject: preorder ? "Your Smelt pre-order is confirmed. Warm regards." : "Your Smelt order is confirmed. Warm regards.", html, text };
}
