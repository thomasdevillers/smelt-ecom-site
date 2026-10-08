import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { STORY } from "@/content/story";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo";
import styles from "./story.module.css";

export const metadata: Metadata = {
  title: "Our story & what Smelt means",
  description: STORY.description,
  alternates: { canonical: "/our-story" },
  openGraph: {
    title: "Our story & what Smelt means · Smelt",
    description: STORY.description,
    url: "/our-story",
    type: "website",
    images: [{ url: "/images/Founders.jpeg", width: 1280, height: 1600, alt: "Tom and Marc, Smelt co-founders" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Our story & what Smelt means · Smelt",
    description: STORY.description,
    images: ["/images/Founders.jpeg"],
  },
};

export default function OurStoryPage() {
  return (
    <main className={styles.page}>
      <script {...jsonLdScript(breadcrumbLd([["Home", "/"], ["Our story", "/our-story"]]))} />

      <section className={styles.hero} aria-labelledby="story-title">
        <div className={styles.heroCopy}>
          <SectionLabel>Our story · Cape Town</SectionLabel>
          <h1 id="story-title" className={styles.h1}>{STORY.title}</h1>
          <p className={styles.lead}>{STORY.intro}</p>
          <a href="#the-name" className={styles.textLink}>What does Smelt mean? <span aria-hidden="true">↓</span></a>
        </div>
        <figure className={styles.founders}>
          <Image
            src="/images/Founders.jpeg"
            alt="Tom and Marc, Smelt co-founders"
            width={1280}
            height={1600}
            sizes="(min-width: 1320px) 480px, (min-width: 880px) 40vw, calc(100vw - 40px)"
            loading="eager"
            className={styles.founderPhoto}
          />
          <figcaption className={styles.caption}>Tom &amp; Marc · The people behind the hats</figcaption>
        </figure>
      </section>

      <section className={styles.chapter} aria-labelledby="beginning-title">
        <div className={styles.chapterHeading}>
          <SectionLabel>01 / The beginning</SectionLabel>
          <h2 id="beginning-title" className={styles.h2}>{STORY.beginning.title}</h2>
        </div>
        <div className={styles.prose}>
          {STORY.beginning.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>

      <section id="the-name" className={styles.meaning} aria-labelledby="meaning-title">
        <div className={styles.definition}>
          <SectionLabel tone="peach">02 / The name</SectionLabel>
          <h2 id="meaning-title" className={styles.word}>smelt</h2>
          <p className={styles.translation}>{STORY.meaning.definition}</p>
        </div>
        <div className={styles.meaningCopy}>
          <h3 className={styles.h2}>{STORY.meaning.title}</h3>
          {STORY.meaning.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>

      <section className={styles.chapter} aria-labelledby="hat-title">
        <div className={styles.chapterHeading}>
          <SectionLabel>03 / The hat</SectionLabel>
          <h2 id="hat-title" className={styles.h2}>{STORY.hat.title}</h2>
        </div>
        <div className={styles.prose}>
          {STORY.hat.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <Link href="/articles/what-does-a-sauna-hat-do" className={styles.textLink}>How a sauna hat works <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="regards-title">
        <SectionLabel>A note from us</SectionLabel>
        <h2 id="regards-title" className={styles.signoff}>{STORY.closing.title}</h2>
        <p>{STORY.closing.body}</p>
        <span className={styles.signature}>Tom &amp; Marc</span>
        <div className={styles.actions}>
          <Button href="/product">Find your sauna hat <span aria-hidden="true">→</span></Button>
          <Link href="/contact" className={styles.textLink}>Say hello</Link>
        </div>
      </section>
    </main>
  );
}
