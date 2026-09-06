import Image from "next/image";
import SectionLabel from "./ui/SectionLabel";
import styles from "./InTheWild.module.css";

const WILD_PHOTOS = [
  {
    src: "/images/MarcTomFront.jpg",
    alt: "Smelt sauna hats in the wild",
    width: 800,
    height: 1000,
  },
  {
    src: "/images/TomSide.jpeg",
    alt: "Smelt sauna hat side profile",
    width: 800,
    height: 1000,
  },
  {
    src: "/images/MarcSide.jpg",
    alt: "Smelt sauna hat side profile",
    width: 800,
    height: 1000,
  },
];

/**
 * "Smelt in the wild" section showcasing real photos of the founders/customers using the hats.
 */
export default function InTheWild() {
  return (
    <section id="in-the-wild" className={styles.section}>
      <div className={styles.header}>
        <SectionLabel>Real Photos</SectionLabel>
        <h2 className={styles.h2}>Smelt in the Wild</h2>
        <p className={styles.copy}>
          Out of the studio and into the heat. Here is a look at Smelt felt hats in action.
        </p>
      </div>

      <div className={styles.grid}>
        {WILD_PHOTOS.map((photo, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.imgWrap}>
              <Image
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                className={styles.img}
                sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, 33vw"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
