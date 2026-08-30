import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ProductExplorer from "@/components/ProductExplorer";
import HairPSA from "@/components/HairPSA";
import FounderStory from "@/components/FounderStory";
import Faq from "@/components/Faq";
import Policies from "@/components/Policies";
import RitualBanner from "@/components/RitualBanner";
import { FAQ } from "@/content/faq";

export const metadata = {
  description:
    "100% merino wool felt sauna hats, embroidered not printed. Two colourways, one size, in stock and shipping worldwide from Cape Town.",
  alternates: { canonical: "/" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqLd).replace(/</g, "\\u003c"),
        }}
      />
      <Hero />
      <ProductExplorer />
      <Features />
      <FounderStory />
      <HairPSA />
      <Faq />
      <Policies />
      <RitualBanner />
    </main>
  );
}
