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
    `<p>Your hat is in stock. We'll be in touch with tracking as soon as it's on its way from Cape Town.</p>`,
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: "Your Smelt order is confirmed.",
    heading: "Your order is confirmed",
    intro: "Thanks for ordering a Smelt sauna hat.",
    blocks,
    cta: { label: "Visit Smelt", url: absoluteUrl("/") },
  });
  return { subject: "Your Smelt order is confirmed. Warm regards.", html, text };
}
