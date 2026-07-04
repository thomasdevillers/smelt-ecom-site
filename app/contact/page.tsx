"use client";
import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { CONTACT } from "@/content/contact";
import styles from "./contact.module.css";

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <SectionLabel>{CONTACT.eyebrow}</SectionLabel>
        <h1 className={styles.h1}>{CONTACT.title}</h1>
        <p className={styles.intro}>{CONTACT.intro}</p>
      </section>

      <div className={styles.layout}>
        <section className={styles.formWrap}>
          {sent ? (
            <div className={styles.thanks}>
              <div className={styles.thanksMark}>✳</div>
              <h2 className={styles.thanksH2}>Got it. Warm regards.</h2>
              <p className={styles.thanksP}>
                Thanks for reaching out. We&rsquo;ll reply to you shortly, usually
                within a day or two.
              </p>
            </div>
          ) : (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <label className={styles.field}>
                <span className={styles.label}>Your name</span>
                <input className={styles.input} name="name" required />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Message</span>
                <textarea
                  className={styles.textarea}
                  name="message"
                  rows={5}
                  required
                />
              </label>
              <button className={styles.submit} type="submit">
                Send it <span>→</span>
              </button>
            </form>
          )}
        </section>

        <aside className={styles.side}>
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
        </aside>
      </div>
    </main>
  );
}
