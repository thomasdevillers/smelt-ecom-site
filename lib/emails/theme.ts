export const COLORS = {
  paper: "#F6F1E3",
  paperWarm: "#FBF7EC",
  ink: "#0E3B2A",
  inkDeep: "#0A2C20",
  terracotta: "#E4633C",
  peach: "#F2A98C",
  inkSoft: "rgba(14,59,42,0.75)",
  border: "rgba(14,59,42,0.2)",
} as const;

export const FONT_STACK =
  '"Space Grotesk", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

/** Absolute URL for email assets/links. base defaults to SITE_URL env. */
export function absoluteUrl(path: string, base = process.env.SITE_URL ?? ""): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
