import Image from "next/image";
import Link from "next/link";
import SectionLabel from "./ui/SectionLabel";
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
            width={1280}
            height={1600}
            sizes="(min-width: 1320px) 560px, (min-width: 880px) 45vw, calc(100vw - 40px)"
            className={styles.photo}
          />
          <figcaption className={styles.cap}>
            Tom &amp; Marc · Co-founders
          </figcaption>
        </figure>
      </div>
      <div className={styles.copy}>
        <SectionLabel>03 / The people behind it</SectionLabel>
        <h2 className={styles.h2}>Two mates.<br />Warm regards.</h2>
        <p className={styles.p}>We’re Tom and Marc, two mates in Cape Town who wanted a proper sauna hat. Smelt grew from that simple idea: one useful thing, with a little character.</p>
        <p className={styles.p}>Our name means “melt” in Afrikaans. A fitting word for a hot room, and a moment to let the day go.</p>
        <Link href="/our-story" className={styles.storyLink}>Read our story <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
