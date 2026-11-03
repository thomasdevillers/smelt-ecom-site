import { PREORDER_MODE, PREORDER_COPY, PREORDER_PRICE, REGULAR_PRICE } from "../salesMode";
import { renderEmail } from "./layout";
import { orderItemsTable } from "./components";
import { COLORS, FONT_STACK, escapeHtml, marketingEmailUrl } from "./theme";
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
  const subjects = PREORDER_MODE ? [
    `Your Smelt pre-order is waiting — R${d.voucher.amount} off inside`,
    "Secure your Smelt at the pre-order price",
    "One last reminder to reserve your Smelt pre-order",
  ] as const : [
    "R50 off the Smelt you left behind",
    "Your R50 Smelt code is still warm",
    "A final reminder about your Smelt cart",
  ] as const;
  const headings = PREORDER_MODE
    ? ["Your next sauna ritual starts here.", "Get ahead of the restock.", "Make the next batch yours."] as const
    : ["Still thinking it over?", "Your cart is still here.", "One last warm nudge."] as const;
  const messages = PREORDER_MODE ? [
    "You picked your Smelt, but your pre-order isn’t complete yet. Complete payment to secure your hats from the incoming batch, with priority over general restock sales.",
    `Why wait for the restock? Pre-order for R${PREORDER_PRICE} per hat instead of the regular R${REGULAR_PRICE} — a saving of R${REGULAR_PRICE - PREORDER_PRICE} per hat. The incoming batch has a limited number of hats, and a saved cart does not secure yours.`,
    "This is the last email we’ll send about this checkout. If you want your Smelt from the incoming batch, complete your pre-order while space is available. Your saved cart is not a confirmed pre-order.",
  ] as const : [
    "You left checkout before payment. Nothing was charged and the hats in your cart have not been reserved.",
    "A quick reminder in case life interrupted checkout. Your personal R50 code is still ready below.",
    "This is the last email we’ll send about this checkout. Your personal R50 code remains available until the date below.",
  ] as const;
  const voucherBlock = `<table class="email-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.paper}" style="margin:18px 0;border:1px solid ${COLORS.border};border-radius:16px;background-color:${COLORS.paper};"><tr><td class="email-text" align="center" style="padding:22px;"><span class="email-muted" style="font-family:${FONT_STACK};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.inkSoft};">R${d.voucher.amount} ${PREORDER_MODE ? "extra off your pre-order" : "off this checkout"}</span><br/><strong style="display:inline-block;margin-top:8px;font-family:${FONT_STACK};font-size:24px;letter-spacing:.08em;color:${COLORS.ink};">${escapeHtml(d.voucher.code)}</strong><br/><span class="email-muted" style="display:inline-block;margin-top:8px;font-family:${FONT_STACK};font-size:12px;color:${COLORS.inkSoft};">Expires ${escapeHtml(expiry)} · use the same email address</span></td></tr></table>`;
  const unsubscribe = `<p class="email-muted email-rule" style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.inkSoft};">Sent by Smelt in Cape Town because you asked us to follow up about this checkout. <a class="email-link" href="${escapeHtml(d.unsubscribeUrl)}" style="color:${COLORS.ink};text-decoration:underline;">Stop these emails</a> or contact hello@saunahat.co.za.</p>`;
  const { html, text } = renderEmail({
    preheader: PREORDER_MODE
      ? [`Pre-order for R${PREORDER_PRICE} per hat, plus R${d.voucher.amount} off your checkout. ${PREORDER_COPY}`, `Save R${REGULAR_PRICE - PREORDER_PRICE} per hat and reserve from the incoming batch. ${PREORDER_COPY}`, `Your R${d.voucher.amount} offer expires ${expiry}. ${PREORDER_COPY}`][d.step]
      : d.step === 0 ? "Your cart and a personal R50 code are inside." : "Your Smelt cart is still ready to reopen.",
    heading: headings[d.step],
    blocks: [p(greeting), p(messages[d.step]), ...(PREORDER_MODE ? [p(`${escapeHtml(PREORDER_COPY)}`), p(`R${PREORDER_PRICE} per hat during pre-orders; regular price R${REGULAR_PRICE}. Payment is taken in full to confirm your pre-order.`)] : []), orderItemsTable(d.items), voucherBlock, p(PREORDER_MODE
      ? `Use the button below and the same email address to apply your R${d.voucher.amount} discount automatically. It comes off your checkout total, on top of the pre-order price. Pre-order availability is checked again before payment.`
      : "The private button below restores the quantities from this checkout. Current stock is confirmed again before payment.")],
    cta: { label: PREORDER_MODE ? "Complete my pre-order" : "Return to my checkout", url: escapeHtml(marketingEmailUrl(d.recoveryUrl, "cart_recovery", `step_${d.step + 1}`)) },
    afterCtaBlocks: [...(PREORDER_MODE ? [p("Questions about the wait? Reply to this email. You can cancel before dispatch for a full refund by contacting hello@saunahat.co.za.")] : []), unsubscribe],
  });
  return { subject: subjects[d.step], html, text };
}
