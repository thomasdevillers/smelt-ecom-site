import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";
import { SITE_URL } from "@/lib/seo";

type Route = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  lastModified?: string;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Route[] = [
    // Advance these dates only after substantive page/content changes, not
    // on every build. Guides retain their own editorial update dates below.
    { path: "/", priority: 1, changeFrequency: "weekly", lastModified: "2026-11-10" },
    { path: "/product", priority: 0.9, changeFrequency: "weekly", lastModified: "2026-11-10" },
    { path: "/our-story", priority: 0.6, changeFrequency: "yearly" },
    { path: "/articles", priority: 0.7, changeFrequency: "monthly" },
    ...GUIDES.map<Route>((g) => ({
      path: `/articles/${g.slug}`,
      priority: 0.7,
      changeFrequency: "monthly",
      lastModified: g.updated,
    })),
    { path: "/care", priority: 0.6, changeFrequency: "monthly" },
    { path: "/policies", priority: 0.5, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  ];

  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    ...(r.lastModified ? { lastModified: new Date(r.lastModified) } : {}),
  }));
}
