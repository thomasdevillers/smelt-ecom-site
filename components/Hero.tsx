import Image from "next/image";
import Button from "./ui/Button";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.copy}>
        <div className={styles.badge}>100% WOOL FELT · EST. IN THE HEAT</div>
        <h1 className={styles.h1}>A hat for people who peak at 90°C.</h1>
        <p className={styles.sub}>
          Smelt makes felt sauna hats that keep your head civil while the rest
          of you slowly gives up. Two colourways. One temperature.{" "}
          <span className={styles.script}>Warm regards.</span>
        </p>
        <div className={styles.ctas}>
          <Button href="/product" variant="solid">
            Pre-order yours <span>→</span>
          </Button>
          <Button href="/#bundles" variant="outline">
            See the bundles
          </Button>
        </div>
        <div className={styles.stars}>
          <span className={styles.starRow}>✳</span> 100% merino wool.
        </div>
      </div>
      <div className={styles.imgWrap}>
        <div className={styles.halo} />
        <Image
          src="/images/hat-green-front-nobg.png"
          alt="Smelt Forest Green sauna hat"
          width={330}
          height={330}
          className={styles.hat}
          priority
        />
      </div>
    </section>
  );
}
