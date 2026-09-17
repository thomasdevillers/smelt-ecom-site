"use client";

import Image from "next/image";
import { useState } from "react";
import { PRODUCT, type Colour } from "@/lib/product";
import styles from "./ProductGallery.module.css";

export default function ProductGallery({ colour }: { colour: Colour }) {
  const [selected, setSelected] = useState(0);
  const variant = PRODUCT.variants[colour];
  const media = [
    { id: "front", label: "Front", src: variant.images.front, alt: `${variant.name} Smelt sauna hat, front embroidery`, width: 520, height: 520, lifestyle: false },
    { id: "back", label: "Back", src: variant.images.back, alt: `${variant.name} Smelt sauna hat, back embroidery`, width: 520, height: 520, lifestyle: false },
    { id: "sauna", label: "In the sauna", src: "/images/MarcTomFront.jpg", alt: "Forest Green and Natural Cream Smelt sauna hats being worn in a sauna", width: 800, height: 1000, lifestyle: true },
    { id: "fit", label: "Fit", src: "/images/TomSide.jpeg", alt: "Natural Cream Smelt sauna hat shown from the side while being worn", width: 800, height: 1000, lifestyle: true },
  ];
  const active = media[selected] ?? media[0];

  return (
    <div className={styles.wrap}>
      <div className={styles.main}>
        <Image
          key={`${active.id}-${active.src}`}
          src={active.src}
          alt={active.alt}
          width={active.width}
          height={active.height}
          className={`${styles.mainImage} ${active.lifestyle ? styles.cover : ""}`}
          sizes="(max-width: 879px) calc(100vw - 40px), 50vw"
          priority={selected === 0}
        />
        <span className={styles.caption}>{active.label}</span>
      </div>

      <div className={styles.thumbnails} aria-label="Product images">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.thumbnail} ${selected === index ? styles.thumbnailActive : ""}`}
            onClick={() => setSelected(index)}
            aria-label={`Show ${item.label.toLowerCase()} image`}
            aria-pressed={selected === index}
          >
            <Image
              src={item.src}
              alt=""
              width={item.width}
              height={item.height}
              className={`${styles.thumbnailImage} ${item.lifestyle ? styles.cover : ""}`}
              sizes="72px"
            />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
