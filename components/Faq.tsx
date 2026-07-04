import Accordion from "./Accordion";
import SectionLabel from "./ui/SectionLabel";
import { FAQ } from "@/content/faq";
import styles from "./Faq.module.css";

/**
 * Homepage FAQ. Reuses the shared Accordion so the disclosure behaviour matches
 * the product page. Content lives in content/faq.ts.
 */
export default function Faq() {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.head}>
        <SectionLabel>Before you ask</SectionLabel>
        <h2 className={styles.h2}>Questions, answered.</h2>
      </div>
      <div className={styles.list}>
        {FAQ.map((item, i) => (
          <Accordion key={item.q} title={item.q} defaultOpen={i === 0}>
            {item.a}
          </Accordion>
        ))}
      </div>
    </section>
  );
}
