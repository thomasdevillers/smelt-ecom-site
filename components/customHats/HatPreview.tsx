/* eslint-disable @next/next/no-img-element -- artwork comes from short-lived signed R2 URLs and local blob: previews. */
import type { CSSProperties } from "react";
import type { LogoSide } from "@/lib/customHats/shared";
import styles from "./CustomHat.module.css";

export interface PreviewLogo { enabled: boolean; src: string | null; label: string }

/**
 * A blank Smelt hat photo, reduced to a neutral shading map, multiplied over
 * the chosen felt colour. Logo artwork and the tag sit on top.
 */
export default function HatPreview({ hex, side, front, back, tag, size = "large" }: {
  hex: string;
  side: LogoSide;
  front: PreviewLogo;
  back: PreviewLogo;
  tag: string | null;
  size?: "large" | "small";
}) {
  const logo = side === "front" ? front : back;
  const shading = `/custom-hats/hat-${side}.webp`;
  return <div className={`${styles.hat} ${size === "small" ? styles.hatSmall : ""}`} style={{ "--felt": hex, "--shade": `url(${shading})` } as CSSProperties} aria-hidden="true">
    <div className={styles.hatColour} />
    <img className={styles.hatShade} src={shading} alt="" draggable={false} />
    {logo.enabled && <div className={`${styles.hatLogo} ${side === "back" ? styles.hatLogoBack : ""}`}>
      {logo.src ? <img src={logo.src} alt="" draggable={false} /> : size === "large" && <span>{logo.label}</span>}
    </div>}
    {tag !== null && <div className={`${styles.hatTag} ${side === "back" ? styles.hatTagBack : ""}`}><span>{tag || "Your text"}</span></div>}
  </div>;
}
