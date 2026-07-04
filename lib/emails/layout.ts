import { COLORS, FONT_STACK, absoluteUrl } from "./theme";

export interface Cta {
  label: string;
  url: string;
}

export interface EmailInput {
  preheader: string;
  heading: string;
  intro?: string;
  blocks?: string[]; // trusted HTML fragments built by components.ts
  cta?: Cta;
  signoff?: string; // defaults to the warm signoff
}

const DEFAULT_SIGNOFF = "Warm regards,<br/>Tom &amp; Marc";

function ctaHtml(cta: Cta): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">` +
    `<tr><td style="border-radius:999px;background:${COLORS.terracotta};">` +
    `<a href="${cta.url}" style="display:inline-block;padding:16px 26px;` +
    `font-family:${FONT_STACK};font-weight:600;font-size:15px;color:${COLORS.paper};` +
    `text-decoration:none;border-radius:999px;">${cta.label}</a>` +
    `</td></tr></table>`
  );
}

export function renderEmail(input: EmailInput): { html: string; text: string } {
  const { preheader, heading, intro, blocks = [], cta } = input;
  const signoff = input.signoff ?? DEFAULT_SIGNOFF;
  const hat = absoluteUrl("/images/hat-green-front-nobg.png");

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.paper};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">` +
    `<tr><td align="center" style="padding-bottom:8px;">` +
    `<img src="${hat}" width="96" height="96" alt="Smelt" style="display:block;"/>` +
    `<div style="font-family:${FONT_STACK};font-weight:700;font-size:22px;color:${COLORS.ink};letter-spacing:-0.02em;padding-top:8px;">Smelt</div>` +
    `</td></tr>` +
    `<tr><td style="background:${COLORS.paperWarm};border:1px solid ${COLORS.border};border-radius:24px;padding:28px;">` +
    `<h1 style="margin:0 0 12px;font-family:${FONT_STACK};font-weight:800;font-size:26px;line-height:1.1;letter-spacing:-0.02em;color:${COLORS.ink};">${heading}</h1>` +
    (intro ? `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.inkSoft};">${intro}</p>` : "") +
    blocks.join("") +
    (cta ? ctaHtml(cta) : "") +
    `<p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${signoff}</p>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:24px 8px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.inkSoft};">` +
    `Hand-felted in Cape Town. 100% merino wool.<br/>` +
    `100% WOOL FELT · EMBROIDERED, NOT PRINTED · MADE TO SWEAT IN` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+\n/g, "\n").trim();
  const text = [
    heading,
    "",
    intro ?? "",
    ...blocks.map(stripTags),
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    "Warm regards,",
    "Tom & Marc",
    "",
    "Hand-felted in Cape Town. 100% merino wool.",
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
