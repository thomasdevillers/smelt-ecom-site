import Image from "next/image";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { ABOUT } from "@/content/about";
import styles from "./about.module.css";

export const metadata = { title: "About Smelt · Warm regards from Cape Town" };

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <SectionLabel>{ABOUT.eyebrow}</SectionLabel>
        <h1 className={styles.h1}>{ABOUT.title}</h1>
        <p className={styles.intro}>{ABOUT.intro}</p>
      </section>

      <section className={styles.founders}>
        {ABOUT.founders.map((f) => (
          <figure key={f.name} className={styles.founder}>
            <Image
              src={f.image}
              alt={f.name}
              width={520}
              height={640}
              className={styles.photo}
            />
            <figcaption>
              <div className={styles.fName}>{f.name}</div>
              <div className={styles.fRole}>{f.role}</div>
              <p className={styles.fBio}>{f.bio}</p>
            </figcaption>
          </figure>
        ))}
      </section>

      <section className={styles.values}>
        {ABOUT.values.map((v) => (
          <div key={v.title} className={styles.value}>
            <h3 className={styles.vTitle}>{v.title}</h3>
            <p className={styles.vBody}>{v.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.cta}>
        <div className={styles.signoff}>{ABOUT.signoff}</div>
        <Button href="/product" variant="solid">
          Pre-order yours <span>→</span>
        </Button>
      </section>
    </main>
  );
}
