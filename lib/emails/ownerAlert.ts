import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow, addressBlock } from "./components";
import { escapeHtml } from "./theme";
import type { OrderItem } from "../orders";
import type { ShippingAddress } from "../address";

export function ownerAlertEmail(d: {
  reference: string; email: string; total: string; items: OrderItem[]; address?: ShippingAddress | null;
}): { subject: string; html: string; text: string } {
  const blocks = [
    `<p>New paid order.</p>`,
    `<p>Reference: <strong>${escapeHtml(d.reference)}</strong><br/>Customer: ${escapeHtml(d.email)}</p>`,
    orderItemsTable(d.items),
    moneyRow("Total", d.total),
    d.address ? `<p><strong>Ship to:</strong></p>${addressBlock(d.address)}` : "",
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: `New order ${d.reference}`,
    heading: "New Smelt order",
    blocks,
  });
  return { subject: `New Smelt order: ${d.total} (${d.reference})`, html, text };
}
