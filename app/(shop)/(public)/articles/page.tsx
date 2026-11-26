import Image from "next/image";
import Link from "next/link";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { ARTICLES_INDEX, GUIDES } from "@/content/guides";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo";
import styles from "./articles.module.css";

export const metadata = {
  title: { absolute: "Sauna Hat Guides · Material, Fit & Care | Smelt" },
  description:
    "Plain-English guides to sauna hats from the people who make them: what a sauna hat actually does, why wool is used, and how to choose one on material, fit and care.",
  alternates: { canonical: "/articles" },
};

const crumbsLd = breadcrumbLd([
  ["Home", "/"],
  ["Articles", "/articles"],
]);

export default function ArticlesPage() {
  return (
    <main className={styles.page}>
      <script {...jsonLdScript(crumbsLd)} />

      <section className={styles.hero}>
        <SectionLabel>{ARTICLES_INDEX.eyebrow}</SectionLabel>
        <h1 className={styles.h1}>{ARTICLES_INDEX.title}</h1>
        <p className={styles.intro}>{ARTICLES_INDEX.intro}</p>
      </section>

      <section className={styles.grid}>
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/articles/${g.slug}`} className={styles.card}>
            <div className={styles.imgWrap}>
              <Image
                src={g.hero.src}
                alt={g.hero.alt}
                width={g.hero.width}
                height={g.hero.height}
                className={styles.img}
                sizes="(max-width: 700px) 100vw, 33vw"
              />
            </div>
            <div className={styles.cardBody}>
              <div className={styles.meta}>
                {g.nav} · {g.readMinutes} min read
              </div>
              <h2 className={styles.cardTitle}>{g.h1}</h2>
              <p className={styles.cardCopy}>{g.description}</p>
              <span className={styles.more}>
                Read the guide <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        ))}

        <Link href="/care" className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.meta}>Care · cleaning questions</div>
            <h2 className={styles.cardTitle}>How to clean and care for a wool sauna hat</h2>
            <p className={styles.cardCopy}>
              Drying, smell, sweat marks, shrinkage, storage, and the four things you should never
              do to felt. Every cleaning question we actually get asked.
            </p>
            <span className={styles.more}>
              Read the care guide <span aria-hidden>→</span>
            </span>
          </div>
        </Link>
      </section>

      <section className={styles.cta}>
        <div className={styles.signoff}>{ARTICLES_INDEX.signoff}</div>
        <Button href="/product" variant="solid">
          Shop the hat <span>→</span>
        </Button>
      </section>
    </main>
  );
}
