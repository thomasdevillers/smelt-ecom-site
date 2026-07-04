import Button from "./ui/Button";
import SectionLabel from "./ui/SectionLabel";
import { LAUNCH } from "@/lib/launch";
import styles from "./FoundingBatch.module.css";

/**
 * Pre-launch banner: explains that Smelt hasn't launched, and that the first
 * run is a small, numbered founding batch you can pre-order now.
 */
export default function FoundingBatch() {
  return (
    <section id="founding-batch" className={styles.section}>
      <div className={styles.banner}>
        <SectionLabel tone="peach">Not launched yet</SectionLabel>
        <h2 className={styles.h2}>{LAUNCH.batchLabel}: the founding run. Only {LAUNCH.batchSize}.</h2>
        <p className={styles.p}>
          We haven&rsquo;t officially launched. The very first run is just {LAUNCH.batchSize} hats,
          hand-felted to order. Pre-order now to claim one. Every founding-batch
          order comes with {LAUNCH.perk}, and you&rsquo;ll own an original before anyone else can.
        </p>
        <div className={styles.meta}>
          <span className={styles.chip}>{LAUNCH.batchSize} hats only</span>
          <span className={styles.chip}>Hand-felted to order</span>
          <span className={styles.chip}>Pre-order · {LAUNCH.shipEstimate}</span>
        </div>
        <Button href="/product" variant="paper">Pre-order yours <span>→</span></Button>
      </div>
    </section>
  );
}
