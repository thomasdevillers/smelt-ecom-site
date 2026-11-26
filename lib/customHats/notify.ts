import { Resend } from "resend";
import { renderEmail } from "../emails/layout";
import { absoluteUrl, escapeHtml } from "../emails/theme";
import { feltColour } from "./palette";
import { totalHats, type CustomHatSubmission } from "./shared";
import { assertReviewCustomWritable } from "../reviewCustomPersistence";

/** Best-effort alert to our own inbox; the cutover pause rejects before sending. */
export async function notifyCustomHatSubmission(submission: CustomHatSubmission, revision: number) {
  assertReviewCustomWritable();
  const to = process.env.CUSTOM_HATS_NOTIFY_TO || "hello@saunahat.co.za";
  if (!process.env.RESEND_API_KEY || !process.env.ORDER_FROM_EMAIL) return;
  const { contact } = submission;
  const who = contact.company ? `${contact.name} (${contact.company})` : contact.name;
  const lines = submission.hats.map((hat, index) => {
    const colour = feltColour(hat.colour);
    const extras = [
      hat.front.enabled && "front logo",
      hat.back.enabled && "back logo",
      hat.tag.enabled && `tag “${hat.tag.text}”`,
    ]
      .filter(Boolean)
      .join(", ");
    return `Hat ${index + 1}: ${hat.quantity} × ${colour ? `${colour.name} (${colour.code})` : hat.colour}${extras ? ` · ${extras}` : ""}`;
  });
  const { html, text } = renderEmail({
    preheader: `${who} sent ${submission.hats.length} custom hat design${submission.hats.length === 1 ? "" : "s"}`,
    heading: revision > 1 ? "Custom hat request updated" : "New custom hat request",
    blocks: [
      `<p><strong>${escapeHtml(who)}</strong><br/>${[contact.email, contact.phone].filter(Boolean).map(escapeHtml).join(" · ")}</p>`,
      `<p>${lines.map(escapeHtml).join("<br/>")}</p>`,
      `<p><strong>${totalHats(submission)} hats in total.</strong></p>`,
      submission.notes ? `<p>Notes: ${escapeHtml(submission.notes)}</p>` : "",
    ].filter(Boolean),
    cta: { label: "Open in admin", url: absoluteUrl("/admin") },
    signoff: "",
  });
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.ORDER_FROM_EMAIL,
      to,
      subject: `Custom hats: ${who} · ${totalHats(submission)} hats`,
      html,
      text,
      ...(contact.email ? { replyTo: contact.email } : {}),
    });
  } catch (error) {
    console.error("Custom hat alert failed", error instanceof Error ? error.name : "Unknown error");
  }
}
