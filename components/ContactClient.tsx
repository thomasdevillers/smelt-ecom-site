import SectionLabel from "@/components/ui/SectionLabel";
import { CONTACT } from "@/content/contact";
import styles from "@/app/contact/contact.module.css";

export default function ContactClient() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <SectionLabel>{CONTACT.eyebrow}</SectionLabel>
        <h1 className={styles.h1}>{CONTACT.title}</h1>
        <p className={styles.intro}>{CONTACT.intro}</p>
      </section>

      <div className={styles.layout}>
        <section className={styles.side}>
          <h2 className={styles.sideTitle}>Reach us directly</h2>
          <ul className={styles.methods}>
            {CONTACT.methods.map((m) => (
              <li key={m.label} className={styles.method}>
                <span className={styles.methodLabel}>{m.label}</span>
                {m.href ? (
                  <a className={styles.methodValue} href={m.href}>
                    {m.value}
                  </a>
                ) : (
                  <span className={styles.methodValue}>{m.value}</span>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.hours}>{CONTACT.hours}</p>
          <div className={styles.signoff}>{CONTACT.signoff}</div>
        </section>
      </div>
    </main>
  );
}
