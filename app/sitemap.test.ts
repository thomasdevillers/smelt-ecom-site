import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { GUIDES } from "@/content/guides";
import { SITE_URL } from "@/lib/seo";

describe("sitemap update dates", () => {
  it("records the homepage and product SEO updates explicitly", () => {
    const entries = sitemap();
    for (const path of ["/", "/product"]) {
      const entry = entries.find(item => item.url === `${SITE_URL}${path}`);
      expect(entry?.lastModified).toEqual(new Date("2026-11-10"));
    }
  });

  it("preserves each guide's editorial update date", () => {
    const entries = sitemap();
    for (const guide of GUIDES) {
      const entry = entries.find(item => item.url === `${SITE_URL}/articles/${guide.slug}`);
      expect(entry?.lastModified).toEqual(new Date(guide.updated));
    }
  });

  it("does not invent update dates for unchanged pages", () => {
    const entry = sitemap().find(item => item.url === `${SITE_URL}/our-story`);
    expect(entry).not.toHaveProperty("lastModified");
  });
});
