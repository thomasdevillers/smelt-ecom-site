import { renderEmail } from "./layout";
import { absoluteUrl } from "./theme";

export function welcomeEmail(): { subject: string; html: string; text: string } {
  const blocks = [
    `<p>Thanks for joining the Smelt list. We make sauna hats for people who peak at 90°C — 100% wool felt, embroidered, not printed, hand-felted in Cape Town.</p>`,
    `<p>We'll only email when it's worth it: new batches, restocks, and the occasional warm note.</p>`,
  ];
  const { html, text } = renderEmail({
    preheader: "Warm regards from Smelt.",
    heading: "Warm regards from Smelt",
    blocks,
    cta: { label: "Shop the hats", url: absoluteUrl("/product") },
  });
  return { subject: "Warm regards from Smelt", html, text };
}
