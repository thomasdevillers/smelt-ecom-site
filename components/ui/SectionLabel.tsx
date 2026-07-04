import styles from "./SectionLabel.module.css";

export default function SectionLabel({ children, tone = "terracotta" }: { children: React.ReactNode; tone?: "terracotta" | "peach" }) {
  return <div className={`${styles.label} ${tone === "peach" ? styles.peach : ""}`}>{children}</div>;
}
