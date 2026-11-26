import { renderEmail } from "./layout";
import { absoluteUrl, COLORS, escapeHtml, marketingEmailUrl } from "./theme";
import { EMAIL_QUESTION } from "../research/emailEntry";

/** One-off update for unshipped orders from the November 2026 pre-order batch. */
export function earlyShippingEmail(): { subject: string; html: string; text: string } {
  const options = EMAIL_QUESTION.options!.map((option) => {
    const url = new URL(
      marketingEmailUrl(
        absoluteUrl("/help-shape-smelt"),
        "early_shipping_november_2026",
        "questionnaire_option",
      ),
    );
    url.searchParams.set("frequency", option);
    return { option, url: url.toString() };
  });
  const questionBlock =
    `<div style="margin:28px 0;">` +
    `<p style="font-size:10px;letter-spacing:.1em;font-weight:700;">YOUR SAUNA ROUTINE</p>` +
    `<h2 class="email-heading" style="font-size:28px;line-height:1.15;letter-spacing:-.04em;margin:16px 0;">${escapeHtml(EMAIL_QUESTION.title)}</h2>` +
    `<p style="font-size:12px;">Choose one to get started. You can confirm or change it on the website.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    options
      .map(
        ({ option, url }) =>
          `<tr><td style="padding-bottom:9px;"><a class="email-link email-rule" href="${escapeHtml(url)}" style="display:block;padding:16px 17px;border:1px solid ${COLORS.border};border-radius:3px;color:${COLORS.ink};font-size:13px;text-decoration:none;">${escapeHtml(option)}<span aria-hidden="true" style="float:right;font-size:18px;"> ○</span></a></td></tr>`,
      )
      .join("") +
    `</table></div>`;
  const rendered = renderEmail({
    preheader:
      "Your hat is ready early. Shipping starts 24 November, ahead of our original 30 November date.",
    heading: "Less waiting. More sweating.",
    intro: "A little good news for your next sauna session.",
    blocks: [
      "<p>We promised to start shipping on 30 November. Your hats are ready ahead of schedule, and we couldn’t be happier to get them to you sooner: <strong>we’re starting to ship tomorrow, 24 November.</strong></p>",
      "<p>We’ll be working through orders from tomorrow. You don’t need to do anything. We’ll be in touch with your delivery details when your order is on its way.</p>",
      "<p><strong>While we get your hat on its way, could we ask you a small favour?</strong></p>",
      "<p>As one of the people who backed Smelt, you’re exactly who we’d love to hear from. We’ve put together a questionnaire to help shape what comes next: what you’d actually use, what matters to you, and what deserves a place in your sauna kit.</p>",
      "<p>If you have a few minutes, we’d really appreciate your honest thoughts. You’re helping us build something for people like you, not just adding another product to the shelf.</p>",
      questionBlock,
    ],
    afterCtaBlocks: [
      "<p>Completely optional, of course. Your order is already being taken care of.</p>",
      "<p>Thanks for being part of Smelt. We can’t wait for your hat to join you in the heat.</p>",
    ],
  });
  // The shared renderer strips inline links; retain every answer URL in plain text too.
  for (const { option, url } of options) {
    rendered.text = rendered.text.replace(`${option} ○`, `${option}: ${url}`);
  }
  return {
    subject: "Your Smelt is ready early. Shipping starts tomorrow",
    ...rendered,
  };
}
