/* eslint-disable @next/next/no-img-element -- static shading map layered over a CSS colour. */
import type { CSSProperties } from "react";
import styles from "./CustomHat.module.css";

const SHADING = "/custom-hats/hat-front.webp";

/**
 * Colour-only preview: a blank Smelt hat photo, reduced to a neutral shading
 * map, multiplied over the chosen felt colour. Logos and tags are not drawn;
 * we make the real mock-up once we have the customer's files.
 */
export default function HatPreview({
  hex,
  size = "large",
}: {
  hex: string;
  size?: "large" | "small";
}) {
  return (
    <div
      className={`${styles.hat} ${size === "small" ? styles.hatSmall : ""}`}
      style={{ "--felt": hex, "--shade": `url(${SHADING})` } as CSSProperties}
      aria-hidden="true"
    >
      <div className={styles.hatColour} />
      <img className={styles.hatShade} src={SHADING} alt="" draggable={false} />
    </div>
  );
}
