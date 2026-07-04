/** Canonical production origin. SITE_URL env wins (matches lib/emails/theme.ts). */
export const SITE_URL = (process.env.SITE_URL ?? "https://saunahat.co.za").replace(/\/$/, "");

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
