import Image from "next/image";
import Button from "./ui/Button";
import SectionLabel from "./ui/SectionLabel";
import styles from "./RitualBanner.module.css";

export default function RitualBanner() {
  return (
    <section id="felt" className={styles.section}>
      <div className={styles.banner}>
        <div>
          <SectionLabel tone="peach">The felt</SectionLabel>
          <h2 className={styles.h2}>Wool up top, so your brain stays chill.</h2>
          <p className={styles.p}>Dense merino felt insulates your scalp from sauna heat, the traditional trick that keeps you in the room longer. Ours just happen to have opinions embroidered on them.</p>
          <Button href="/product" variant="paper">Get yours <span>→</span></Button>
        </div>
        <div className={styles.imgWrap}>
          <Image src="/images/logo-cream.jpeg" alt="Smelt" width={340} height={340} className={styles.img} />
        </div>
      </div>
    </section>
  );
}
