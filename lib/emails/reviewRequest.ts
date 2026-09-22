import { renderEmail } from "./layout";
import { COLORS, FONT_STACK, escapeHtml } from "./theme";

export function reviewRequestEmail(d: { name?: string | null; reviewUrl: string }) {
  const greeting = d.name?.trim() ? `Hi ${escapeHtml(d.name.trim().split(/\s+/)[0])},` : "Hi there,";
  const p = (body: string) => `<p style="margin:0 0 18px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${body}</p>`;
  const { html, text } = renderEmail({
    preheader: "Tell us how your Smelt is doing and get R50 off your next order.",
    heading: "How is the hat holding up?",
    blocks: [
      p(greeting),
      p("You’ve had a little time to put your Smelt through the heat. We’d love your honest take — good, bad, or somewhere in between."),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border:1px solid ${COLORS.border};border-radius:16px;background:${COLORS.paper};"><tr><td style="padding:20px;">${p("<strong>Our thank-you: R50 off your next order.</strong>")}${p("Submit any honest verified review and we’ll email your personal voucher immediately. Every rating qualifies. The voucher is single-use and valid for 90 days.")}</td></tr></table>`,
      p("Your private link is connected to your completed order and can be used once. You can add up to three photos, but photos are completely optional."),
    ],
    cta: { label: "Leave my review", url: escapeHtml(d.reviewUrl) },
    afterCtaBlocks: [p("The R50 thank-you is for taking the time to review, not for leaving a positive rating.")],
  });
  return { subject: "Your honest Smelt review = R50 off", html, text };
}
