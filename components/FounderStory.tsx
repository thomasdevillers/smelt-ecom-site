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
            src="/images/founders-at-contrast.webp"
            alt="Tom and Marc wearing Smelt sauna hats at Contrast in Kommetjie"
            width={1440}
            height={1920}
            sizes="(min-width: 1320px) 560px, (min-width: 880px) 45vw, calc(100vw - 40px)"
            className={styles.photo}
          />
          <figcaption className={styles.cap}>
            Tom &amp; Marc · Contrast, Kommetjie
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
