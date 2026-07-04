import Button from "./ui/Button";
import SectionLabel from "./ui/SectionLabel";
import styles from "./HairPSA.module.css";

const WITHOUT = [
  "Direct heat draws moisture out of each strand.",
  "Hair becomes dry, brittle, and breaks more easily.",
  "Colour-treated hair fades faster in the heat.",
  "A hot scalp makes sessions less comfortable.",
];
const WITH = [
  "Wool felt shields hair from direct heat.",
  "Moisture stays in, so hair stays soft.",
  "Colour is better preserved between sessions.",
  "Your scalp stays cooler and more comfortable.",
];

export default function HairPSA() {
  return (
    <section id="hair" className={styles.section}>
      <div className={styles.head}>
        <SectionLabel>Hair care</SectionLabel>
        <h2 className={styles.h2}>Why skipping the sauna hat is quietly wrecking your hair</h2>
        <p className={styles.intro}>Sauna air is very hot and very dry. Without a hat, that heat reaches your hair directly and pulls the moisture out of it. Over repeated sessions that leaves hair dry, brittle, and prone to damage. A wool felt hat sits between your hair and the heat, so it stays protected.</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.cardLight}>
          <div className={styles.tagWithout}>WITHOUT A HAT</div>
          <h3 className={styles.cardH3}>What happens to your hair</h3>
          <ul className={styles.list}>{WITHOUT.map((t) => <li key={t}><span className={styles.minus}>−</span>{t}</li>)}</ul>
        </div>
        <div className={styles.cardDark}>
          <div className={styles.tagWith}>WITH A SAUNA HAT</div>
          <h3 className={styles.cardH3}>How the hat protects it</h3>
          <ul className={styles.list}>{WITH.map((t) => <li key={t}><span className={styles.plus}>+</span>{t}</li>)}</ul>
        </div>
      </div>
      <div className={styles.cta}><Button href="/product" variant="solid">Protect your hair: shop the hats <span>→</span></Button></div>
    </section>
  );
}
