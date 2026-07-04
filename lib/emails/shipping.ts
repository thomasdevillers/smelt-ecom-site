import { renderEmail } from "./layout";
import { orderItemsTable } from "./components";
import { escapeHtml } from "./theme";
import type { OrderItem } from "../orders";

export function shippingEmail(d: {
  name?: string | null; carrier: string; trackingNumber: string; trackingUrl?: string; items: OrderItem[];
}): { subject: string; html: string; text: string } {
  const greeting = d.name ? `Hi ${escapeHtml(d.name)},` : "Hi there,";
  const blocks = [
    `<p>${greeting}</p>`,
    `<p>Good news — your Smelt hat is on its way.</p>`,
    `<p><strong>Carrier:</strong> ${escapeHtml(d.carrier)}<br/><strong>Tracking number:</strong> ${escapeHtml(d.trackingNumber)}</p>`,
    orderItemsTable(d.items),
  ];
  const { html, text } = renderEmail({
    preheader: "Your Smelt hat is on its way.",
    heading: "Your hat is on its way",
    blocks,
    cta: d.trackingUrl ? { label: "Track your parcel", url: d.trackingUrl } : undefined,
  });
  return { subject: "Your Smelt hat is on its way", html, text };
}
