import type { Metadata } from "next";
import { Bricolage_Grotesque, Space_Grotesk, Caveat } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import Ticker from "@/components/Ticker";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import { Analytics } from "@vercel/analytics/next";

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

export const metadata: Metadata = {
  title: "Smelt · Sauna hats for people who peak at 90°C",
  description:
    "Smelt makes 100% wool felt sauna hats. Two colourways. One temperature. Warm regards.",
  openGraph: {
    title: "Smelt · Sauna hats for people who peak at 90°C",
    description: "100% wool felt. Embroidered, not printed. Warm regards.",
    images: ["/images/hat-green-front-nobg.png"],
    locale: "en_ZA",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${space.variable} ${caveat.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <CartProvider>
          <Ticker />
          <Header />
          {children}
          <Footer />
          <CartDrawer />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
