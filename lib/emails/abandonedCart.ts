import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow } from "./components";
import { escapeHtml } from "./theme";
import type { OrderItem } from "../orders";

export function abandonedCartEmail(d: {
  name?: string | null; items: OrderItem[]; total: string; cartUrl: string;
}): { subject: string; html: string; text: string } {
  const greeting = d.name ? `Hi ${escapeHtml(d.name)},` : "Hi there,";
  const blocks = [
    `<p>${greeting}</p>`,
    `<p>You left a Smelt hat warming up in your bag. Each one is hand-felted to order, and the founding batch is filling up.</p>`,
    orderItemsTable(d.items),
    moneyRow("Your bag", d.total),
    `<p style="font-size:12px;">Not interested? No trouble — just reply to this email and we'll leave you be.</p>`,
  ];
  const { html, text } = renderEmail({
    preheader: "Your Smelt hat is still warming up.",
    heading: "Your hat is still warming up",
    blocks,
    cta: { label: "Finish your order", url: d.cartUrl },
  });
  return { subject: "Your Smelt hat is still warming up", html, text };
}
