import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smelt · Sauna hats",
    short_name: "Smelt",
    description:
      "100% merino wool felt sauna hats. Embroidered, not printed. Warm regards from Cape Town.",
    start_url: "/",
    display: "standalone",
    background_color: "#EFE4C4",
    theme_color: "#0E3B2A",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
