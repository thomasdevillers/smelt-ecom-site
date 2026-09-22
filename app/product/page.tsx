import type { Metadata } from "next";
import ProductClient from "@/components/ProductClient";
import { PRODUCT } from "@/lib/product";
import { BASE_PRICE, SHIPPING_FEE } from "@/lib/pricing";
import { abs, breadcrumbLd, jsonLdScript } from "@/lib/seo";

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

// Google requires priceValidUntil for offers; a rolling ~1yr horizon avoids a
// "past date" warning without needing a real cutoff. Static so the page stays
// prerendered (no request-time Date()).
const PRICE_VALID_UNTIL = "2027-12-31";

const productLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: PRODUCT.name,
  description:
    "100% wool felt sauna hat, embroidered front and back. One size fits most heads.",
  image: [
    abs(PRODUCT.variants.green.images.front),
    abs(PRODUCT.variants.cream.images.front),
  ],
  brand: { "@type": "Brand", name: "Smelt" },
  material: "100% wool felt",
  offers: {
    "@type": "Offer",
    url: abs("/product"),
    priceCurrency: "ZAR",
    price: BASE_PRICE,
    priceValidUntil: PRICE_VALID_UNTIL,
    // Availability is loaded live; do not publish a static in-stock claim.
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "ZA",
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      itemCondition: "https://schema.org/NewCondition",
    },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        // The advertised single hat has the standard nationwide delivery fee.
        value: SHIPPING_FEE,
        currency: "ZAR",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "ZA",
      },
    },
  },
};

const crumbsLd = breadcrumbLd([
  ["Home", "/"],
  [PRODUCT.name, "/product"],
]);

export default function ProductPage() {
  return (
    <>
      <script {...jsonLdScript(productLd)} />
      <script {...jsonLdScript(crumbsLd)} />
      <ProductClient />
    </>
  );
}
