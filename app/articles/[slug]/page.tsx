import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Accordion from "@/components/Accordion";
import RichText from "@/components/RichText";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { GUIDES, getGuide, type GuideFigure } from "@/content/guides";
import { articleLd, breadcrumbLd, faqLd, jsonLdScript } from "@/lib/seo";
import styles from "./article.module.css";

type Params = { params: Promise<{ slug: string }> };

/** Every guide is known at build time, so the set of routes is closed. */
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  const path = `/articles/${guide.slug}`;
  return {
    title: { absolute: guide.title },
    description: guide.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: guide.h1,
      description: guide.description,
      url: path,
      images: [{ url: guide.hero.src, alt: guide.hero.alt }],
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.h1,
      description: guide.description,
      images: [guide.hero.src],
    },
  };
}

/** Stable in-page anchor for a section heading. */
function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const DATE_FMT = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function Figure({ figure, priority }: { figure: GuideFigure; priority?: boolean }) {
  return (
    <figure className={styles.figure}>
      <Image
        src={figure.src}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        className={styles.figureImg}
        sizes="(max-width: 880px) 100vw, 780px"
        priority={priority}
      />
      <figcaption className={styles.caption}>{figure.caption}</figcaption>
    </figure>
  );
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const path = `/articles/${guide.slug}`;
  const related = GUIDES.filter((g) => g.slug !== guide.slug);

  const crumbsLd = breadcrumbLd([
    ["Home", "/"],
    ["Articles", "/articles"],
    [guide.nav, path],
  ]);
  const pageFaqLd = faqLd([{ q: guide.question, a: guide.answer }, ...guide.faq]);
  const pageArticleLd = articleLd({
    headline: guide.h1,
    description: guide.description,
    path,
    image: guide.hero.src,
    published: guide.published,
    updated: guide.updated,
  });

  return (
    <main className={styles.page}>
      <script {...jsonLdScript(crumbsLd)} />
      <script {...jsonLdScript(pageArticleLd)} />
      <script {...jsonLdScript(pageFaqLd)} />

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden>/</span>
        <Link href="/articles">Articles</Link>
      </nav>

      <header className={styles.head}>
        <SectionLabel>
          Guide · {guide.readMinutes} min read
        </SectionLabel>
        <h1 className={styles.h1}>{guide.h1}</h1>
        <p className={styles.lede}>{guide.answer}</p>
        <div className={styles.byline}>
          By Tom &amp; Marc, Smelt's founders, who sauna in Cape Town · Updated{" "}
          <time dateTime={guide.updated}>{DATE_FMT.format(new Date(guide.updated))}</time>
        </div>
      </header>

      <Figure figure={guide.hero} priority />

      <section className={styles.takeaways} aria-labelledby="takeaways-title">
        <h2 id="takeaways-title" className={styles.takeawaysTitle}>
          The short version
        </h2>
        <ul className={styles.takeawaysList}>
          {guide.takeaways.map((t) => (
            <li key={t}>
              <span className={styles.plus}>+</span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles.contents} aria-label="On this page">
        <div className={styles.contentsTitle}>On this page</div>
        <ol className={styles.contentsList}>
          {guide.blocks.map((b) => (
            <li key={b.heading}>
              <a href={`#${anchor(b.heading)}`}>{b.heading}</a>
            </li>
          ))}
          <li>
            <a href="#faq">Common questions</a>
          </li>
        </ol>
      </nav>

      <article className={styles.prose}>
        {guide.blocks.map((b) => (
          <section key={b.heading} id={anchor(b.heading)} className={styles.block}>
            <h2 className={styles.h2}>{b.heading}</h2>
            {b.body.map((p) => (
              <p key={p} className={styles.p}>
                <RichText text={p} />
              </p>
            ))}
            {b.list && (
              <ul className={styles.list}>
                {b.list.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            )}
            {b.figure && <Figure figure={b.figure} />}
          </section>
        ))}
      </article>

      <section id="faq" className={styles.faq}>
        <h2 className={styles.h2}>Common questions</h2>
        <div className={styles.faqList}>
          {guide.faq.map((item, i) => (
            <Accordion key={item.q} title={item.q} defaultOpen={i === 0}>
              {item.a}
            </Accordion>
          ))}
        </div>
      </section>

      <section className={styles.related}>
        <h2 className={styles.relatedTitle}>Keep reading</h2>
        <div className={styles.relatedList}>
          {related.map((g) => (
            <Link key={g.slug} href={`/articles/${g.slug}`} className={styles.relatedCard}>
              <div className={styles.relatedMeta}>{g.nav}</div>
              <div className={styles.relatedH}>{g.h1}</div>
            </Link>
          ))}
          <Link href="/care" className={styles.relatedCard}>
            <div className={styles.relatedMeta}>Care &amp; cleaning</div>
            <div className={styles.relatedH}>How to clean and care for a wool sauna hat</div>
          </Link>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.ctaCopy}>
          One hat, two colourways, 100% wool felt. Embroidered, never printed.
        </div>
        <Button href="/product" variant="solid">
          Shop the Smelt hat <span>→</span>
        </Button>
      </section>
    </main>
  );
}
