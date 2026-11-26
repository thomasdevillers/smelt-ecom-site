import { absoluteUrl, escapeHtml, marketingEmailUrl } from "./theme";

export function customerThankYouEmail(firstName = "there") {
  const name = firstName.trim().split(/\s+/)[0] || "there";
  const claimUrl = marketingEmailUrl(absoluteUrl("/product"), "customer_thank_you", "claim");
  const linkLabel = "Here's a link to the site for your convenience";
  const paragraphs = [
    `Hey ${name}!`,
    "Tom & Marc here from Smelt Sauna Hats!",
    "We wanted to send you a little something.",
    "Usually, when someone discovers Smelt, it's through an Instagram ad. And as a small business, we spend quite a bit of money finding new customers.",
    "But you? You've already supported us.",
    "You took a chance on our little Cape Town brand, and we genuinely appreciate it.",
    "So instead of spending more money on another ad, we thought we'd give some of it back to the people who've already helped us grow.",
    "Here's a little thank-you, just for you:",
    "Get R100 off when you buy 2 Smelt sauna hats.",
    "That's R800 instead of R900, with free shipping included.",
    "Use code SMELT100 at checkout.",
    linkLabel,
    "Maybe you've got a sauna buddy who's still wearing a towel on their head. Or a partner who keeps trying to steal your hat.",
    "Either way, now's your chance to share the love.",
    "Thanks again for being part of Smelt. It means more than you know.",
    "With love,\n\nTom & Marc at The Smelt Team",
    "P.S. We'd love to know how your hat's treating you! Just hit reply. We read every single one of them.",
  ];
  return {
    subject: "We'd rather give you R100 than Instagram.",
    text: paragraphs
      .map((paragraph) => (paragraph === linkLabel ? `${paragraph}: ${claimUrl}` : paragraph))
      .join("\n\n"),
    // Deliberately no branded layout, images, buttons, or promotional typography.
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;background:#fff;">${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;">${paragraph === linkLabel ? `<a href="${escapeHtml(claimUrl)}">${escapeHtml(paragraph)}</a>` : escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")}</body></html>`,
  };
}
