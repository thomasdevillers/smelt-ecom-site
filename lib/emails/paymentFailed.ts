import { renderEmail } from "./layout";
import { orderItemsTable } from "./components";
import type { OrderItem } from "../orders";

export function paymentFailedEmail(d: {
  items?: OrderItem[]; retryUrl: string;
}): { subject: string; html: string; text: string } {
  const blocks = [
    `<p>It looks like your payment didn't go through — no charge was made.</p>`,
    `<p>Your hat is still waiting. Pick up right where you left off whenever you're ready.</p>`,
    d.items && d.items.length ? orderItemsTable(d.items) : "",
  ].filter(Boolean);
  const { html, text } = renderEmail({
    preheader: "Your payment didn't go through — try again.",
    heading: "Your payment didn't go through",
    intro: "No charge was made, and your order is still waiting.",
    blocks,
    cta: { label: "Try again", url: d.retryUrl },
  });
  return { subject: "Your Smelt payment didn't go through", html, text };
}
