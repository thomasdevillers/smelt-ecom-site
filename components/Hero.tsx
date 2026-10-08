import { BASE_PRICE, formatMoney } from "@/lib/pricing";
import { PREORDER_COPY, PREORDER_MODE } from "@/lib/salesMode";
import Image from "next/image";
import Button from "./ui/Button";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.copy}>
        <div className={styles.eyebrow}>Sauna hats · Warm regards from Cape Town</div>
        <h1 className={styles.h1}>A hat for people who peak at 90°C.</h1>
        <p className={styles.sub}>
          Wool felt sauna hats for hot rooms and a little headspace.
          Switch off, settle in, and make yourself at home on the bench.
        </p>
        <div className={styles.ctas}>
          <Button href="/product" variant="solid">
            Shop the hats <span aria-hidden="true">→</span>
          </Button>
        </div>
      </div>
      <figure className={styles.scene}>
        <Image
          src="/images/MarcTomFront.jpg"
          alt="Two people sitting on a wooden sauna bench wearing Natural Cream and Forest Green Smelt hats"
          width={1086}
          height={1448}
          sizes="(min-width: 1320px) 592px, (min-width: 880px) 47vw, calc(100vw - 40px)"
          className={styles.photo}
          loading="eager"
          fetchPriority="high"
        />
        <figcaption className={styles.caption}>A good place to do a whole lot of nothing.</figcaption>
      </figure>
    </section>
  );
}
