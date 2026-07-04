import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ProductExplorer from "@/components/ProductExplorer";
import Bundles from "@/components/Bundles";
import Reels from "@/components/Reels";
import HairPSA from "@/components/HairPSA";
import FoundingBatch from "@/components/FoundingBatch";
import FounderStory from "@/components/FounderStory";
import Faq from "@/components/Faq";
import RitualBanner from "@/components/RitualBanner";

export default function Home() {
  return (
    <main>
      <Hero />
      <FoundingBatch />
      <ProductExplorer />
      <Features />
      <FounderStory />
      <HairPSA />
      <Bundles />
      <Reels />
      <Faq />
      <RitualBanner />
    </main>
  );
}
