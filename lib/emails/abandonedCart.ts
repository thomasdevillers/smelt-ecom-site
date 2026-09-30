import { PREORDER_MODE, PREORDER_COPY, PREORDER_PRICE } from "../salesMode";
import { renderEmail } from "./layout";
import { orderItemsTable, moneyRow } from "./components";
import { escapeHtml } from "./theme";
import type { OrderItem } from "../orderTypes";

export function abandonedCartEmail(d: {
  name?: string | null; items: OrderItem[]; total: string; cartUrl: string;
}): { subject: string; html: string; text: string } {
  const greeting = d.name ? `Hi ${escapeHtml(d.name)},` : "Hi there,";
  const blocks = [
    `<p>${greeting}</p>`,
    `<p>You left a Smelt hat warming up in your bag. ${PREORDER_MODE ? `Your pre-order is not yet confirmed. These hats are not ready for immediate dispatch. ${escapeHtml(PREORDER_COPY)} Complete payment to secure yours from the incoming batch for R${PREORDER_PRICE} per hat.` : "It is in stock and ready when you are."}</p>`,
    orderItemsTable(d.items),
    moneyRow("Your bag", d.total),
    `<p style="font-size:12px;">Not interested? No trouble — just reply to this email and we'll leave you be.</p>`,
  ];
  const { html, text } = renderEmail({
    preheader: PREORDER_MODE ? `Reserve yours from the incoming batch. ${PREORDER_COPY}` : "Your Smelt hat is still warming up.",
    heading: PREORDER_MODE ? "Your Smelt pre-order is waiting" : "Your hat is still warming up",
    blocks,
    cta: { label: PREORDER_MODE ? "Complete my pre-order" : "Finish your order", url: d.cartUrl },
  });
  return { subject: PREORDER_MODE ? "Your Smelt pre-order is waiting" : "Your Smelt hat is still warming up", html, text };
}
