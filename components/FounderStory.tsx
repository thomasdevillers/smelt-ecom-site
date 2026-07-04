import Image from "next/image";
import Button from "./ui/Button";
import SectionLabel from "./ui/SectionLabel";
import { ABOUT } from "@/content/about";
import styles from "./FounderStory.module.css";

/**
 * Homepage trust section: puts real faces and the origin story on the page.
 * Pulls from the shared ABOUT config so it stays in sync with the About page.
 */
export default function FounderStory() {
  return (
    <section id="story" className={styles.section}>
      <div className={styles.photos}>
        {ABOUT.founders.map((f) => (
          <figure key={f.name} className={styles.photoFig}>
            <Image
              src={f.image}
              alt={f.name}
              width={360}
              height={440}
              className={styles.photo}
            />
            <figcaption className={styles.cap}>
              {f.name} · {f.role}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className={styles.copy}>
        <SectionLabel>The people behind it</SectionLabel>
        <h2 className={styles.h2}>Made by two people who kept losing to the heat.</h2>
        <p className={styles.p}>{ABOUT.teaser}</p>
        <Button href="/about" variant="outline">
          Read our story <span>→</span>
        </Button>
      </div>
    </section>
  );
}
