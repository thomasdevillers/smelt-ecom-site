import StarMark from "./ui/StarMark";
import styles from "./Ticker.module.css";

const ITEMS = [
  "WARM REGARDS", "100% WOOL FELT", "FREE DELIVERY ON 2+ HATS",
  "EMBROIDERED, NOT PRINTED", "MADE TO SWEAT IN",
];

export default function Ticker() {
  const run = [...ITEMS, ...ITEMS]; // duplicated for seamless -50% loop
  return (
    <div className={styles.bar} aria-hidden="true">
      <div className={styles.track}>
        {run.map((t, i) => (
          <span key={i} className={styles.item}>
            {t}
            <span className={styles.star}>
              <StarMark size={12} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
