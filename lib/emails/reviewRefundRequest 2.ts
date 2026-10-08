import { renderEmail } from "./layout";
import { COLORS, FONT_STACK, escapeHtml } from "./theme";

/** Review invitation for the manually processed R50-per-hat refund. */
export function reviewRefundRequestEmail(d: { name?: string | null; reviewUrl: string }) {
  const reviewUrl = new URL(d.reviewUrl);
  if (reviewUrl.protocol !== "https:" || reviewUrl.username || reviewUrl.password) {
    throw new Error("The personal review link must be an HTTPS URL without credentials.");
  }

  const greeting = d.name?.trim() ? `Hi ${escapeHtml(d.name.trim().split(/\s+/)[0])},` : "Hi there,";
  const p = (body: string) => `<p class="email-text" style="margin:0 0 18px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${body}</p>`;
  const { html, text } = renderEmail({
    preheader: "One honest order review, photos of your hats, and R50 back for every hat you bought.",
    heading: "A little feedback. A little back.",
    blocks: [
      p(greeting),
      p("Your Smelt has had some time in the heat. How’s it holding up?"),
      p("We’d love your honest take on your order. Fit, feel, sauna sessions - whatever stood out."),
      `<table class="email-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.paper}" style="margin:8px 0 20px;border:1px solid ${COLORS.border};border-radius:16px;background-color:${COLORS.paper};"><tr><td class="email-text" style="padding:20px;"><p class="email-text" style="margin:0 0 12px;font-family:${FONT_STACK};font-size:22px;font-weight:700;line-height:1.3;color:${COLORS.ink};">R50 back. For every hat.</p><p class="email-text" style="margin:0;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">Leave one review of your order and <strong>add photos of your hats</strong>. We’ll refund R50 for every hat you bought in that order. Every rating counts.</p></td></tr></table>`,
      p("Your personal link is below. Choose a rating, write a few words and upload your hat photos."),
    ],
    cta: { label: "Leave my review", url: escapeHtml(d.reviewUrl) },
    afterCtaBlocks: [
      p("Once your review and hat photos are in, we’ll work out your refund and return it to your original payment method within a couple of days."),
    ],
  });

  return { subject: "Review your Smelt. Get R50 back per hat.", html, text };
}
