import type { Metadata } from "next";
import { Bricolage_Grotesque, Space_Grotesk, Caveat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import Ticker from "@/components/Ticker";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import { SITE_URL, abs } from "@/lib/seo";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-bricolage",
});
const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-caveat",
});

const OG_IMAGE = {
  url: "/images/hat-green-front.jpeg",
  width: 1200,
  height: 1200,
  alt: "Smelt Forest Green wool felt sauna hat",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Smelt · Sauna hats for people who peak at 90°C",
    template: "%s · Smelt",
  },
  description:
    "Smelt makes 100% merino wool felt sauna hats. Embroidered, not printed. Two colourways. Pre-order now, shipping worldwide from Cape Town.",
  applicationName: "Smelt",
  keywords: [
    "sauna hat",
    "wool felt sauna hat",
    "merino wool sauna hat",
    "Finnish sauna hat",
    "sauna cap",
    "sauna accessories",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Smelt · Sauna hats for people who peak at 90°C",
    description: "100% wool felt. Embroidered, not printed. Warm regards.",
    url: SITE_URL,
    siteName: "Smelt",
    images: [OG_IMAGE],
    locale: "en_ZA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smelt · Sauna hats for people who peak at 90°C",
    description: "100% wool felt. Embroidered, not printed. Warm regards.",
    images: [OG_IMAGE.url],
  },
};

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Smelt",
  url: SITE_URL,
  logo: abs("/images/hat-green-front.jpeg"),
  description:
    "Smelt makes 100% merino wool felt sauna hats — embroidered, never printed. Made in Cape Town.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Cape Town",
    addressCountry: "ZA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-ZA"
      className={`${bricolage.variable} ${space.variable} ${caveat.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationLd).replace(/</g, "\\u003c"),
          }}
        />
        <CartProvider>
          <Ticker />
          <Header />
          {children}
          <Footer />
          <CartDrawer />
        </CartProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
