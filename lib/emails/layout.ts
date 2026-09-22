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
  afterCtaBlocks?: string[]; // supporting content after the primary action
  signoff?: string; // defaults to the warm signoff
}

const DEFAULT_SIGNOFF = "Warm regards,<br/>Tom &amp; Marc";

function ctaHtml(cta: Cta): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">` +
    `<tr><td class="email-cta-cell" bgcolor="${COLORS.ink}" style="border-radius:999px;background-color:${COLORS.ink};">` +
    `<a class="email-cta" href="${cta.url}" style="display:inline-block;padding:16px 26px;background-color:${COLORS.ink};` +
    `font-family:${FONT_STACK};font-weight:600;font-size:15px;color:${COLORS.paper};` +
    `text-decoration:none;border-radius:999px;">${cta.label}</a>` +
    `</td></tr></table>`
  );
}

export function renderEmail(input: EmailInput): { html: string; text: string } {
  const { preheader, heading, intro, blocks = [], cta, afterCtaBlocks = [] } = input;
  const signoff = input.signoff ?? DEFAULT_SIGNOFF;
  const hat = absoluteUrl("/images/hat-green-front-nobg.png");
  const darkRules = (prefix = "") =>
    `${prefix}.email-body{background-color:${COLORS.inkDeep}!important;}` +
    `${prefix}.email-card{background-color:${COLORS.darkCard}!important;border-color:${COLORS.darkBorder}!important;}` +
    `${prefix}.email-heading,${prefix}.email-wordmark,${prefix}.email-text,${prefix}.email-card p,${prefix}.email-card td,${prefix}.email-card strong{color:${COLORS.paper}!important;}` +
    `${prefix}.email-muted,${prefix}.email-footer{color:${COLORS.creamMuted}!important;}` +
    `${prefix}.email-rule{border-color:${COLORS.darkBorder}!important;}` +
    `${prefix}.email-panel{background-color:${COLORS.inkDeep}!important;border-color:${COLORS.darkBorder}!important;}` +
    `${prefix}.email-cta-cell,${prefix}.email-card a.email-cta{background-color:${COLORS.paper}!important;color:${COLORS.ink}!important;}` +
    `${prefix}.email-card a.email-link{color:${COLORS.paper}!important;}` +
    `${prefix}.email-logo-tile{background-color:${COLORS.paperWarm}!important;}`;

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<meta name="color-scheme" content="light dark"/>` +
    `<meta name="supported-color-schemes" content="light dark"/>` +
    `<style type="text/css">:root{color-scheme:light dark;supported-color-schemes:light dark;}` +
    `@media (prefers-color-scheme:dark){${darkRules()}}${darkRules("[data-ogsc] ")}</style></head>` +
    `<body class="email-body" style="margin:0;padding:0;background-color:${COLORS.paper};color:${COLORS.ink};font-family:${FONT_STACK};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` +
    `<table class="email-body" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.paper}" style="background-color:${COLORS.paper};">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">` +
    `<tr><td align="center" style="padding-bottom:8px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="email-logo-tile" width="112" height="112" align="center" valign="middle" bgcolor="${COLORS.paperWarm}" style="width:112px;height:112px;background-color:${COLORS.paperWarm};border-radius:56px;">` +
    `<img src="${hat}" width="96" height="96" alt="Smelt" style="display:block;margin:0 auto;"/>` +
    `</td></tr></table>` +
    `<div class="email-wordmark" style="font-family:${FONT_STACK};font-weight:700;font-size:22px;color:${COLORS.ink};letter-spacing:-0.02em;padding-top:8px;">Smelt</div>` +
    `</td></tr>` +
    `<tr><td class="email-card email-text" bgcolor="${COLORS.paperWarm}" style="background-color:${COLORS.paperWarm};border:1px solid ${COLORS.border};border-radius:24px;padding:28px;color:${COLORS.ink};font-family:${FONT_STACK};font-size:16px;line-height:1.6;">` +
    `<h1 class="email-heading" style="margin:0 0 12px;font-family:${FONT_STACK};font-weight:800;font-size:26px;line-height:1.1;letter-spacing:-0.02em;color:${COLORS.ink};">${heading}</h1>` +
    (intro ? `<p class="email-muted" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.inkSoft};">${intro}</p>` : "") +
    blocks.join("") +
    (cta ? ctaHtml(cta) : "") +
    afterCtaBlocks.join("") +
    `<p class="email-text" style="margin:24px 0 0;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${COLORS.ink};">${signoff}</p>` +
    `</td></tr>` +
    `<tr><td class="email-footer" align="center" style="padding:24px 8px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.inkSoft};">` +
    `Hand-felted in Cape Town. 100% wool.<br/>` +
    `100% WOOL FELT · EMBROIDERED, NOT PRINTED · MADE TO SWEAT IN` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const stripTags = (s: string) =>
    s
      .replace(/<\/(tr|div|p|h1|h2|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(td|th)>/gi, "  ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, "").trim())
      .filter((l) => l.length > 0)
      .join("\n");
  const text = [
    heading,
    "",
    intro ?? "",
    ...blocks.map(stripTags),
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    ...afterCtaBlocks.map(stripTags),
    "",
    "Warm regards,",
    "Tom & Marc",
    "",
    "Hand-felted in Cape Town. 100% wool.",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
