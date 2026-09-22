import { renderEmail } from "./layout";
import { orderItemsTable } from "./components";
import { COLORS, FONT_STACK, escapeHtml } from "./theme";
import type { OrderItem } from "../orderTypes";
import type { VoucherReward } from "../vouchers";

export type CartRecoveryStep = 0 | 1 | 2;

export function cartRecoveryEmail(d: {
  step: CartRecoveryStep;
  name?: string | null;
  items: OrderItem[];
  recoveryUrl: string;
  unsubscribeUrl: string;
  voucher: VoucherReward;
}) {
  const greeting = d.name?.trim() ? `Hi ${escapeHtml(d.name.trim().split(/\s+/)[0])},` : "Hi there,";
  const expiry = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date(d.voucher.expiresAt));
  const p = (body: string) => `<p class="email-text" style="margin:0 0 18px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${body}</p>`;
  const subjects = [
    "R50 off the Smelt you left behind",
    "Your R50 Smelt code is still warm",
    "A final reminder about your Smelt cart",
  ] as const;
  const headings = ["Still thinking it over?", "Your cart is still here.", "One last warm nudge."] as const;
  const messages = [
    "You left checkout before payment. Nothing was charged and the hats in your cart have not been reserved.",
    "A quick reminder in case life interrupted checkout. Your personal R50 code is still ready below.",
    "This is the last email we’ll send about this checkout. Your personal R50 code remains available until the date below.",
  ] as const;
  const voucherBlock = `<table class="email-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.paper}" style="margin:18px 0;border:1px solid ${COLORS.border};border-radius:16px;background-color:${COLORS.paper};"><tr><td class="email-text" align="center" style="padding:22px;"><span class="email-muted" style="font-family:${FONT_STACK};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.inkSoft};">R${d.voucher.amount} off this checkout</span><br/><strong style="display:inline-block;margin-top:8px;font-family:${FONT_STACK};font-size:24px;letter-spacing:.08em;color:${COLORS.ink};">${escapeHtml(d.voucher.code)}</strong><br/><span class="email-muted" style="display:inline-block;margin-top:8px;font-family:${FONT_STACK};font-size:12px;color:${COLORS.inkSoft};">Valid through ${escapeHtml(expiry)} · use the same email address</span></td></tr></table>`;
  const unsubscribe = `<p class="email-muted email-rule" style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.inkSoft};">Sent by Smelt in Cape Town because you asked us to follow up about this checkout. <a class="email-link" href="${escapeHtml(d.unsubscribeUrl)}" style="color:${COLORS.ink};text-decoration:underline;">Stop these emails</a> or contact hello@saunahat.co.za.</p>`;
  const { html, text } = renderEmail({
    preheader: d.step === 0 ? "Your cart and a personal R50 code are inside." : "Your Smelt cart is still ready to reopen.",
    heading: headings[d.step],
    blocks: [p(greeting), p(messages[d.step]), orderItemsTable(d.items), voucherBlock, p("The private button below restores the quantities from this checkout. Current stock is confirmed again before payment.")],
    cta: { label: "Return to my checkout", url: escapeHtml(d.recoveryUrl) },
    afterCtaBlocks: [unsubscribe],
  });
  return { subject: subjects[d.step], html, text };
}
