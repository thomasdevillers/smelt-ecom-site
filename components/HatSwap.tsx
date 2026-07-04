"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { PRODUCT, faceLabel, type Colour, type Face } from "@/lib/product";
import styles from "./HatSwap.module.css";

const FACES: Face[] = ["front", "back"];
const STEP = 100; // % of the viewport-wide track to shift per face

/**
 * Auto-cycling hat viewer. Slides between the front and back shots on a timer
 * (no manual controls). Honours prefers-reduced-motion by holding on the front.
 */
export default function HatSwap({
  colour,
  showLabel = false,
  dropShadow = false,
  interval = 3000,
}: {
  colour: Colour;
  showLabel?: boolean;
  dropShadow?: boolean;
  interval?: number;
}) {
  const v = PRODUCT.variants[colour];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = setInterval(() => setIdx((i) => (i + 1) % FACES.length), interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <div className={styles.viewport}>
      <div className={styles.track} style={{ transform: `translateX(-${idx * STEP}%)` }}>
        {FACES.map((f) => (
          <div key={f} className={styles.slide}>
            <Image
              src={v.images[f]}
              alt={`${v.name} sauna hat, ${f}`}
              width={520}
              height={520}
              className={`${styles.img} ${dropShadow ? styles.shadow : ""}`}
              priority={f === "front"}
            />
          </div>
        ))}
      </div>
      {showLabel && <div className={styles.label}>{faceLabel(FACES[idx])}</div>}
    </div>
  );
}
