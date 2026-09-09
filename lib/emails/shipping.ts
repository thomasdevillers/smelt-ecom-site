import { renderEmail } from "./layout";
import { orderItemsTable } from "./components";
import { absoluteUrl, COLORS, escapeHtml, FONT_STACK } from "./theme";
import type { OrderItem } from "../orderTypes";

export interface ShippingEmailData {
  name?: string | null;
  carrier?: string;
  trackingNumber: string;
  trackingUrl?: string;
  items?: OrderItem[];
}

export function shippingEmail(d: ShippingEmailData): { subject: string; html: string; text: string } {
  const trackingNumber = d.trackingNumber.trim();
  if (!trackingNumber) throw new Error("A tracking number is required for the shipping email.");

  const carrier = d.carrier?.trim() || "Aramex";
  const trackingUrl = d.trackingUrl || (carrier.toLowerCase() === "aramex"
    ? `https://aramex.co.za/tracking/TrackShipment.php?waybill=${encodeURIComponent(trackingNumber)}`
    : undefined);
  if (trackingUrl && !["https:", "http:"].includes(new URL(trackingUrl).protocol)) {
    throw new Error("The tracking URL must use HTTP or HTTPS.");
  }
  const careUrl = absoluteUrl("/care", process.env.SITE_URL || "https://saunahat.co.za");
  const careLabel = "How to care for your Smelt →";
  const greeting = d.name?.trim() ? `Hi ${escapeHtml(d.name.trim())},` : "Hi there,";
  const paragraphStyle = `font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};`;
  const p = (body: string) => `<p style="margin:0 0 18px;${paragraphStyle}">${body}</p>`;
  const blocks = [
    p(greeting),
    p(`Your Smelt is on its way with ${escapeHtml(carrier)}. Next stop: your doorstep. Then? Sauna time.`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;border-top:1px solid ${COLORS.border};"><tr><td style="padding:18px 0 0;${paragraphStyle}"><span style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(carrier)} tracking number</span><br/><strong style="font-size:20px;line-height:1.8;overflow-wrap:anywhere;">${escapeHtml(trackingNumber)}</strong></td></tr></table>`,
    ...(d.items?.length ? [orderItemsTable(d.items)] : []),

  ];
  const { html, text } = renderEmail({
    preheader: "Next stop: your doorstep. Track your delivery inside.",
    heading: "Your hat is on the move.",
    blocks,
    afterCtaBlocks: [
      `<p style="margin:0 0 26px;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${COLORS.inkSoft};">Tracking may take a little time to update after dispatch.</p>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};"><tr><td style="padding-top:22px;">${p(`<strong>A little care.<br/>A lot of sauna sessions.</strong>`)}<p style="margin:0 0 10px;${paragraphStyle}font-size:14px;">Keep your Smelt looking good, session after session.</p><a href="${escapeHtml(careUrl)}" style="font-family:${FONT_STACK};font-size:14px;font-weight:600;line-height:1.6;color:${COLORS.ink};text-decoration:underline;">${careLabel}</a></td></tr></table>`,
    ],
    cta: trackingUrl ? { label: "Track my order", url: escapeHtml(trackingUrl) } : undefined,
  });
  return {
    subject: "Your Smelt order is on the move 📦",
    html,
    // The shared layout strips inline links; retain the care URL for text-only readers.
    text: text.replace(careLabel, `${careLabel}: ${careUrl}`)
      .replace(/Track my order: .*/, trackingUrl ? `Track my order: ${trackingUrl}` : ""),
  };
}
