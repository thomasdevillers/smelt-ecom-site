import { renderEmail } from "./layout";
import { absoluteUrl, escapeHtml } from "./theme";

export function deliveredEmail(d: {
  name?: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = d.name ? `Hi ${escapeHtml(d.name)},` : "Hi there,";
  const blocks = [
    `<p>${greeting}</p>`,
    `<p>Your Smelt hat has landed. We hope it keeps your head just the right side of 90°C.</p>`,
    `<p>We'd love to see it in action — reply with a photo, or just tell us how it fits. Every bit of feedback shapes the next batch.</p>`,
  ];
  const { html, text } = renderEmail({
    preheader: "Your Smelt hat has landed.",
    heading: "Your hat has landed",
    blocks,
    cta: { label: "Visit Smelt", url: absoluteUrl("/") },
  });
  return { subject: "Your Smelt hat has landed", html, text };
}
