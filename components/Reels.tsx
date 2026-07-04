import Image from "next/image";
import Button from "./ui/Button";
import SectionLabel from "./ui/SectionLabel";
import styles from "./Reels.module.css";

const REELS = [
  { img: "/images/insta1.jpeg", handle: "tobias.w", caption: "these beautiful things just landed.", likes: "8.9k" },
  { img: "/images/insta2.jpeg", handle: "lena.heats", caption: "this looks strange… until you try it.", likes: "21.0k" },
  { img: "/images/insta3.jpeg", handle: "smeltofficial", caption: "day 3 of sauna-ing every day until we sell 20,000 hats.", likes: "12.4k" },
  { img: "/images/insta4.jpeg", handle: "saunaboy_", caption: "uh it's a sauna hat and what does that do?", likes: "5.2k" },
];

export default function Reels() {
  return (
    <section id="reels" className={styles.section}>
      <div className={styles.head}>
        <div>
          <SectionLabel>Certified 90°C content</SectionLabel>
          <h2 className={styles.h2}>Straight off the <span className={styles.script}>For You</span> page.</h2>
        </div>
        <Button href="/#top" variant="solid">Follow @smelt</Button>
      </div>
      <div className={styles.rail}>
        {REELS.map((r) => (
          <figure key={r.handle} className={styles.reel}>
            <Image src={r.img} alt="" className={styles.reelImg} width={220} height={390} />
            <div className={styles.overlay} />
            <div className={styles.handle}><span className={styles.dot}>{r.handle[0]}</span>{r.handle}</div>
            <figcaption className={styles.caption}>{r.caption}</figcaption>
            <div className={styles.likes}>♥ {r.likes}</div>
          </figure>
        ))}
      </div>
      <div className={styles.tag}>Tag <strong>#warmregards</strong> for a chance to land on the wall.</div>
    </section>
  );
}
