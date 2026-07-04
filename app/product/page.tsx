import type { Metadata } from "next";
import ProductClient from "@/components/ProductClient";
import { PRODUCT } from "@/lib/product";
import { BASE_PRICE } from "@/lib/pricing";
import { abs, breadcrumbLd, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Smelt Sauna Hat · 100% wool felt, embroidered",
  description:
    "The Smelt sauna hat: 100% merino wool felt, embroidered front and back, one size. Forest Green or Natural Cream. Pre-order now, ships worldwide from Cape Town.",
  alternates: { canonical: "/product" },
  openGraph: {
    title: "Smelt Sauna Hat · 100% wool felt, embroidered",
    description:
      "100% merino wool felt, embroidered not printed. Forest Green or Natural Cream. Pre-order now.",
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
    "100% merino wool felt sauna hat, embroidered front and back. One size fits most heads.",
  image: [
    abs(PRODUCT.variants.green.images.front),
    abs(PRODUCT.variants.cream.images.front),
  ],
  brand: { "@type": "Brand", name: "Smelt" },
  material: "100% merino wool felt",
  offers: {
    "@type": "Offer",
    url: abs("/product"),
    priceCurrency: "ZAR",
    price: BASE_PRICE,
    priceValidUntil: PRICE_VALID_UNTIL,
    availability: "https://schema.org/PreOrder",
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "ZA",
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 30,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        // Free shipping on the founding-batch pre-orders (all over threshold).
        value: 0,
        currency: "ZAR",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "ZA",
      },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        // Founding batch is hand-felted to order: ~4–6 weeks.
        handlingTime: {
          "@type": "QuantitativeValue",
          minValue: 28,
          maxValue: 42,
          unitCode: "DAY",
        },
        transitTime: {
          "@type": "QuantitativeValue",
          minValue: 2,
          maxValue: 10,
          unitCode: "DAY",
        },
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
