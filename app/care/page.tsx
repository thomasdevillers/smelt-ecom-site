import Link from "next/link";
import Accordion from "@/components/Accordion";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { CARE } from "@/content/care";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/seo";
import styles from "./care.module.css";

export const metadata = {
  title: { absolute: "Sauna Hat Care & Cleaning · How to Wash Wool Felt | Smelt" },
  description:
    "How to clean and care for a wool felt sauna hat: air-dry after every session, never machine wash, spot-clean with cool water, and fixes for smell, sweat marks, mildew and shrinkage.",
  alternates: { canonical: "/care" },
};

const crumbsLd = breadcrumbLd([
  ["Home", "/"],
  ["Care", "/care"],
]);

const cleaningFaqLd = faqLd(CARE.cleaning.items);

export default function CarePage() {
  return (
    <main className={styles.page}>
      <script {...jsonLdScript(crumbsLd)} />
      <script {...jsonLdScript(cleaningFaqLd)} />
      <section className={styles.hero}>
        <SectionLabel>{CARE.eyebrow}</SectionLabel>
        <h1 className={styles.h1}>{CARE.title}</h1>
        <p className={styles.intro}>{CARE.intro}</p>
      </section>

      <section className={styles.steps}>
        {CARE.steps.map((s, i) => (
          <div key={s.title} className={styles.step}>
            <div className={styles.num}>{String(i + 1).padStart(2, "0")}</div>
            <div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepBody}>{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.donts}>
        <h2 className={styles.dontsTitle}>The four nevers</h2>
        <ul className={styles.dontsList}>
          {CARE.donts.map((d) => (
            <li key={d}>
              <span className={styles.minus}>−</span>
              {d}
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.note}>{CARE.note}</p>

      <section id="cleaning" className={styles.cleaning}>
        <div className={styles.cleaningHead}>
          <SectionLabel>{CARE.cleaning.eyebrow}</SectionLabel>
          <h2 className={styles.h2}>{CARE.cleaning.title}</h2>
          <p className={styles.cleaningIntro}>{CARE.cleaning.intro}</p>
        </div>
        <div className={styles.cleaningList}>
          {CARE.cleaning.items.map((item, i) => (
            <Accordion key={item.q} title={item.q} defaultOpen={i === 0}>
              {item.a}
            </Accordion>
          ))}
        </div>
      </section>

      <section className={styles.more}>
        <h2 className={styles.moreTitle}>More on sauna hats</h2>
        <div className={styles.moreList}>
          <Link href="/articles/what-does-a-sauna-hat-do" className={styles.moreCard}>
            <span className={styles.moreMeta}>Guide</span>
            What does a sauna hat do?
          </Link>
          <Link href="/articles/why-is-wool-used-for-sauna-hats" className={styles.moreCard}>
            <span className={styles.moreMeta}>Guide</span>
            Why is wool used for sauna hats?
          </Link>
          <Link href="/articles/how-to-choose-a-sauna-hat" className={styles.moreCard}>
            <span className={styles.moreMeta}>Guide</span>
            How to choose a sauna hat
          </Link>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.signoff}>{CARE.signoff}</div>
        <Button href="/product" variant="solid">
          Shop now <span>→</span>
        </Button>
      </section>
    </main>
  );
}
