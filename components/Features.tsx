import styles from "./Features.module.css";
const FEATURES = ["100% merino wool felt", "Embroidered, not printed", "One size fits most heads", "Ships worldwide from Cape Town"];
export default function Features() {
  return (
    <section className={styles.strip}>
      <div className={styles.grid}>
        {FEATURES.map((f) => <div key={f} className={styles.cell}>{f}</div>)}
      </div>
    </section>
  );
}
