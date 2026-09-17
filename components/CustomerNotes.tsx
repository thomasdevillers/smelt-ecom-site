import { CUSTOMER_NOTES } from "@/content/customerNotes";
import SectionLabel from "@/components/ui/SectionLabel";
import styles from "./CustomerNotes.module.css";

export default function CustomerNotes() {
  return (
    <section className={styles.section} aria-labelledby="customer-notes-heading">
      <div className={styles.heading}>
        <SectionLabel>Customer notes</SectionLabel>
        <h2 id="customer-notes-heading" className={styles.title}>
          Word from the warm side.
        </h2>
        <p className={styles.intro}>
          A few words shared by people wearing Smelt hats.
        </p>
      </div>

      <div className={styles.grid}>
        {CUSTOMER_NOTES.map((note, index) => (
          <blockquote className={styles.note} key={note}>
            <span className={styles.mark} aria-hidden="true">
              “
            </span>
            <p>{note}</p>
            <footer>
              <span aria-hidden="true">0{index + 1}</span>
              Customer note
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
