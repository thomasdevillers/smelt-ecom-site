import { renderEmail } from "./layout";
import { COLORS, FONT_STACK, absoluteUrl, escapeHtml } from "./theme";
import type { VoucherReward } from "../vouchers";

export function reviewRewardEmail(d: { name?: string | null; voucher: VoucherReward }) {
  const greeting = d.name?.trim() ? `Hi ${escapeHtml(d.name.trim().split(/\s+/)[0])},` : "Hi there,";
  const expires = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date(d.voucher.expiresAt));
  const p = (body: string) => `<p class="email-text" style="margin:0 0 18px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${body}</p>`;
  const { html, text } = renderEmail({
    preheader: `Your R${d.voucher.amount} Smelt voucher is inside.`,
    heading: "Thank you for the honest take.",
    blocks: [
      p(greeting),
      p("Your review is in for moderation. As promised, here is your thank-you for taking the time — it is yours regardless of the rating you left."),
      `<table class="email-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.paper}" style="margin:8px 0 20px;border:1px solid ${COLORS.border};border-radius:16px;background-color:${COLORS.paper};"><tr><td class="email-text" align="center" style="padding:22px;"><span class="email-muted" style="font-family:${FONT_STACK};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.inkSoft};">R${d.voucher.amount} off your next order</span><br/><strong style="display:inline-block;margin-top:8px;font-family:${FONT_STACK};font-size:24px;letter-spacing:.08em;color:${COLORS.ink};">${escapeHtml(d.voucher.code)}</strong></td></tr></table>`,
      p(`Click below and your discount will apply automatically at checkout when you use the same email address. Use it before <strong>${escapeHtml(expires)}</strong>. It can be used once and cannot be exchanged for cash.`),
    ],
    cta: { label: "Shop with my discount", url: absoluteUrl(`/checkout/offer/${encodeURIComponent(d.voucher.code)}`) },
  });
  return { subject: `Your R${d.voucher.amount} Smelt thank-you voucher`, html, text };
}
