"use client";
import { useState } from "react";
import styles from "./Accordion.module.css";

export default function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.item}>
      <button className={styles.trigger} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {title}<span className={styles.icon}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
