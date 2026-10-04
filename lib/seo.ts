/** Canonical production origin. SITE_URL env wins (matches lib/emails/theme.ts). */
export const SITE_URL = (process.env.SITE_URL || "https://saunahat.co.za").replace(/\/$/, "");

/** Absolute URL for a site-relative path. */
export function abs(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** BreadcrumbList JSON-LD from an ordered list of [name, path] trail entries. */
export function breadcrumbLd(trail: [name: string, path: string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: abs(path),
    })),
  };
}

/** Renders a JSON-LD <script> tag with XSS-safe serialization. */
export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json" as const,
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data).replace(/</g, "\\u003c"),
    },
  };
}

/** FAQPage JSON-LD from question/answer pairs. */
export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** Article JSON-LD for an editorial guide page. */
export function articleLd(opts: {
  headline: string;
  description: string;
  path: string;
  image: string;
  published: string;
  updated: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(opts.path) },
    image: [abs(opts.image)],
    datePublished: opts.published,
    dateModified: opts.updated,
    author: { "@type": "Organization", name: "Smelt", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Smelt",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: abs("/images/hat-green-front.jpeg") },
    },
  };
}
