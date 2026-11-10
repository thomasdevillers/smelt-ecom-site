import type { Metadata } from "next";
import { connection } from "next/server";
import ProductClient from "@/components/ProductClient";
import { PRODUCT } from "@/lib/product";
import { abs, breadcrumbLd, jsonLdScript } from "@/lib/seo";
import { getPublishedReviews } from "@/lib/publishedReviews";
import { getProductAvailability } from "@/lib/productAvailability";
import { productGroupLd } from "@/lib/productSchema";
import { reviewNamespace } from "@/lib/reviewNamespace";

export const metadata: Metadata = {
  title: "Smelt Sauna Hat · 100% wool felt, embroidered",
  description:
    "The Smelt sauna hat: 100% wool felt, embroidered front and back, one size. Forest Green or Natural Cream. Shipping nationwide from Cape Town. Check colour availability and pre-order options.",
  alternates: { canonical: "/product" },
  openGraph: {
    title: "Smelt Sauna Hat · 100% wool felt, embroidered",
    description:
      "100% wool felt, embroidered not printed. Forest Green or Natural Cream. Check colour availability and pre-order options.",
    url: abs("/product"),
    type: "website",
  },
};

const crumbsLd = breadcrumbLd([
  ["Home", "/"],
  [PRODUCT.name, "/product"],
]);

export default async function ProductPage({ searchParams }: {
  searchParams: Promise<{ colour?: string | string[]; order?: string | string[] }>;
}) {
  // Stock must be read per request, not frozen into prerendered HTML. Reviews
  // retain their independent cache. This also avoids stock seeding at build time.
  await connection();
  const params = await searchParams;
  const colour = Array.isArray(params.colour) ? params.colour[0] : params.colour;
  const order = Array.isArray(params.order) ? params.order[0] : params.order;
  const initialColour = colour === "cream" ? "cream" : "green";
  const initialQuantity = order === "bundle" || order === "2" ? 2 : order === "3" ? 3 : order === "4" ? 4 : 1;
  const [reviewData, stock] = await Promise.all([getPublishedReviews(), getProductAvailability()]);
  // Never advertise local sample reviews or test-environment ratings to Google.
  const ratings = process.env.NODE_ENV === "production" && reviewNamespace() === "live" ? reviewData : null;
  const productLd = productGroupLd(stock, ratings);
  return (
    <>
      <script {...jsonLdScript(productLd)} />
      <script {...jsonLdScript(crumbsLd)} />
      <ProductClient reviewData={reviewData} initialStock={stock} initialColour={initialColour} initialQuantity={initialQuantity} />
    </>
  );
}
