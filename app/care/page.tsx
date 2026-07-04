import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { CARE } from "@/content/care";
import styles from "./care.module.css";

export const metadata = { title: "Care · Look after your Smelt sauna hat" };

export default function CarePage() {
  return (
    <main className={styles.page}>
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

      <section className={styles.cta}>
        <div className={styles.signoff}>{CARE.signoff}</div>
        <Button href="/product" variant="solid">
          Pre-order yours <span>→</span>
        </Button>
      </section>
    </main>
  );
}
