"use client";
/* eslint-disable @next/next/no-img-element -- tiny static felt tiles; next/image adds nothing here. */
import { useState } from "react";
import { FELT_COLOURS, FELT_FAMILIES, feltColour, feltTile, type FeltFamily } from "@/lib/customHats/palette";
import styles from "./CustomHat.module.css";

export default function FeltPicker({ value, onChange, onShowBook, idPrefix }: {
  value: string | null;
  onChange: (code: string) => void;
  onShowBook: () => void;
  idPrefix: string;
}) {
  const [family, setFamily] = useState<FeltFamily | "all">("all");
  const selected = feltColour(value);
  const colours = family === "all" ? FELT_COLOURS : FELT_COLOURS.filter(colour => colour.family === family);
  return <fieldset className={styles.picker}>
    <legend className={styles.stepLabel}><b>1</b>Felt colour</legend>
    <div className={styles.pickerHead}>
      <p className={styles.selectedFelt} aria-live="polite">
        {selected ? <><span style={{ background: selected.hex }} />{selected.name} <small>{selected.code}</small></> : "Choose a colour from our felt range."}
      </p>
      <button type="button" className={styles.textButton} onClick={onShowBook}>See the swatch book photos ↗</button>
    </div>
    <div className={styles.families} role="group" aria-label="Filter colours">
      <button type="button" aria-pressed={family === "all"} onClick={() => setFamily("all")}>All <span>{FELT_COLOURS.length}</span></button>
      {FELT_FAMILIES.map(f => <button type="button" key={f.id} aria-pressed={family === f.id} onClick={() => setFamily(f.id)}>{f.label}</button>)}
    </div>
    <div className={styles.swatches} role="radiogroup" aria-label="Felt colour">
      {colours.map(colour => {
        const checked = colour.code === value;
        return <label key={colour.code} className={`${styles.swatch} ${checked ? styles.swatchOn : ""}`} title={`${colour.name} · ${colour.code}`}>
          <input type="radio" name={`${idPrefix}-felt`} value={colour.code} checked={checked} onChange={() => onChange(colour.code)} />
          <span className={styles.swatchFelt} style={{ background: colour.hex }}><img src={feltTile(colour.code)} alt="" loading="lazy" />{checked && <i aria-hidden="true">✓</i>}</span>
          <span className={styles.swatchName}>{colour.name}</span>
          <span className={styles.swatchCode}>{colour.code}</span>
        </label>;
      })}
    </div>
    <p className={styles.hint}>Photographed felt. Screens vary, so we&rsquo;ll confirm the exact shade by its code before production.</p>
  </fieldset>;
}
