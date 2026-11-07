import { PREORDER_DATE_LABEL, PREORDER_PRICE, REGULAR_PRICE } from "../salesMode";
import { renderEmail } from "./layout";
import { absoluteUrl, escapeHtml, marketingEmailUrl } from "./theme";

export function preorderAnnouncementEmail(): { subject: string; html: string; text: string } {
  return {
    subject: "Your wait is over — Smelt pre-orders are open",
    ...renderEmail({
      preheader: `You joined the waitlist. Now reserve your Smelt for R${PREORDER_PRICE}. Ships ${PREORDER_DATE_LABEL}.`,
      heading: "The wait is over. The heat is on.",
      blocks: [
        "<p>You asked us to let you know when you could get your hands on a Smelt. Here’s your warm invitation: <strong>pre-orders are now open.</strong></p>",
        "<p>Meet your next sauna companion: 100% wool felt, embroidered, not printed. Choose Forest Green or Cream and make your next sweat a little more Smelt.</p>",
        `<p><strong>Pre-order for R${PREORDER_PRICE}</strong> (regular price R${REGULAR_PRICE}).</p>`,
        `<p><strong>Pre-orders ship on ${escapeHtml(PREORDER_DATE_LABEL)}.</strong> Courier transit starts after dispatch — this is not the delivery date.</p>`,
      ],
      cta: {
        label: "Pre-order your Smelt",
        url: escapeHtml(marketingEmailUrl(absoluteUrl("/product"), "waitlist_preorder", "preorder_button")),
      },
      afterCtaBlocks: [
        "<p>Joining the waitlist didn’t reserve a hat. Place your pre-order to secure yours.</p>",
        "<p>You’re receiving this because you joined the Smelt waitlist. To leave the list, reply to this email.</p>",
      ],
    }),
  };
}
