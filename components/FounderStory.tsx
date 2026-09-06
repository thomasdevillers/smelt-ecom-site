import Image from "next/image";
import SectionLabel from "./ui/SectionLabel";
import { ABOUT } from "@/content/about";
import styles from "./FounderStory.module.css";

/**
 * Homepage trust section: puts real faces and the origin story on the page.
 */
export default function FounderStory() {
  return (
    <section id="story" className={styles.section}>
      <div className={styles.photos}>
        <figure className={styles.photoFig}>
          <Image
            src="/images/Founders.jpeg"
            alt="Tom & Marc, Smelt co-founders"
            width={600}
            height={500}
            className={styles.photo}
          />
          <figcaption className={styles.cap}>
            Tom &amp; Marc · Co-founders
          </figcaption>
        </figure>
      </div>
      <div className={styles.copy}>
        <SectionLabel>The people behind it</SectionLabel>
        <h2 className={styles.h2}>Made by two people who kept losing to the heat.</h2>
        <p className={styles.p}>{ABOUT.teaser}</p>
      </div>
    </section>
  );
}
