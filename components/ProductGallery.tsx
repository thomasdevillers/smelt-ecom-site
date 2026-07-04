"use client";
import HatSwap from "./HatSwap";
import { type Colour } from "@/lib/product";
import styles from "./ProductGallery.module.css";

export default function ProductGallery({ colour }: { colour: Colour }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.main}>
        <HatSwap colour={colour} showLabel />
      </div>
    </div>
  );
}
