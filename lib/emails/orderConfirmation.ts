import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow, addressBlock } from "./components";
import { absoluteUrl, escapeHtml } from "./theme";
import type { OrderItem } from "../orders";
import type { ShippingAddress } from "../address";

export function orderConfirmationEmail(d: {
  reference: string; total: string; items: OrderItem[]; address?: ShippingAddress | null;
}): { subject: string; html: string; text: string } {
  const blocks = [
    `<p>Order reference: <strong>${escapeHtml(d.reference)}</strong></p>`,
    orderItemsTable(d.items),
    moneyRow("Total paid", d.total),
    d.address ? `<p><strong>Shipping to:</strong></p>${addressBlock(d.address)}` : "",
    `<p>Every hat is hand-felted to order, so your pre-order ships with the founding batch, roughly four to six weeks out. We'll be in touch when it's on its way.</p>`,
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: "Your Smelt pre-order is confirmed.",
    heading: "Your pre-order is confirmed",
    intro: "Thanks for pre-ordering a Smelt sauna hat.",
    blocks,
    cta: { label: "Visit Smelt", url: absoluteUrl("/") },
  });
  return { subject: "Your Smelt pre-order is confirmed. Warm regards.", html, text };
}
