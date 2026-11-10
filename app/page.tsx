import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import FounderStory from "@/components/FounderStory";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { COLOURS, PRODUCT } from "@/lib/product";
import { BASE_PRICE, formatMoney } from "@/lib/pricing";
import { PREORDER_COPY, PREORDER_MODE } from "@/lib/salesMode";
import { SITE_URL, jsonLdScript } from "@/lib/seo";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Wool Felt Sauna Hats South Africa",
  description:
    "Shop Smelt's 100% wool felt sauna hats in Forest Green or Natural Cream. Embroidered, not printed. Nationwide South African delivery from Cape Town.",
  alternates: { canonical: "/" },
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Smelt",
  alternateName: "Smelt Sauna Hats",
  url: SITE_URL,
};

export default function Home() {
  return (
    <main className={styles.page}>
      <script {...jsonLdScript(websiteLd)} />
      <Hero />

      <section id="felt" className={styles.felt} aria-labelledby="felt-title">
        <div>
          <SectionLabel>01 / A little insulation</SectionLabel>
          <h2 id="felt-title" className={styles.h2}>Hot room.<br />Cooler head.</h2>
        </div>
        <div className={styles.feltCopy}>
          <p>A wool felt hat puts an insulating layer between your head and the hot sauna air. A simple way to make the heat on your head more comfortable.</p>
          <p>Ours are 100% wool felt, with embroidery on the front and <em>Warm regards</em> on the back. Practical, with a little personality.</p>
          <Link href="/articles/what-does-a-sauna-hat-do" className={styles.textLink}>Why wear a sauna hat? <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section id="shop" className={styles.collection} aria-labelledby="collection-title">
        <div className={styles.collectionHeading}>
          <div>
            <SectionLabel>02 / The collection (all two of them)</SectionLabel>
            <h2 id="collection-title" className={styles.h2}>Same hat.<br />Your kind of colour.</h2>
          </div>
          <p>Forest Green or Natural Cream.<br />One size fits most heads. Both feel at home in the heat.</p>
        </div>
        <div className={styles.colourways}>
          {COLOURS.map((colour) => {
            const variant = PRODUCT.variants[colour];
            return (
              <Link key={colour} href={`/product?colour=${colour}`} className={`${styles.colourway} ${colour === "green" ? styles.green : styles.cream}`}>
                <div className={styles.hatStage}>
                  <Image
                    src={variant.images.front}
                    alt={`${variant.name} Smelt wool felt sauna hat, embroidered with Smelt on the front`}
                    width={533}
                    height={533}
                    sizes="400px"
                    className={styles.hat}
                  />
                </div>
                <div className={styles.colourwayCaption}>
                  <div>
                    <h3>{variant.name}</h3>
                    <p className={styles.price}>{formatMoney(BASE_PRICE)} each{PREORDER_MODE ? " · Pre-order price" : ""}</p>
                    <span>Shop the {variant.name} sauna hat</span>
                  </div>
                  <span className={styles.arrow} aria-hidden="true">↗</span>
                </div>
              </Link>
            );
          })}
        </div>
        <Link href="/product?order=bundle" className={styles.textLink}>Sauna with company? Explore the bundles <span aria-hidden="true">→</span></Link>
      </section>

      <FounderStory />

      <section className={styles.closing} aria-labelledby="closing-title">
        <SectionLabel tone="peach">Make it part of your ritual</SectionLabel>
        <h2 id="closing-title" className={styles.closingTitle}>See you on the bench.</h2>
        <p>Your next sauna companion, with warm regards from Cape Town.</p>
        <Button href="/product" variant="paper">Find your sauna hat <span aria-hidden="true">→</span></Button>
        <div className={styles.delivery}>
          <span>Ships nationwide from Cape Town.</span>
          <span>{PREORDER_MODE ? PREORDER_COPY : "In-stock orders dispatched within 1–3 business days."}</span>
          <Link href="/policies#shipping-policy">Delivery details</Link>
        </div>
      </section>
    </main>
  );
}
