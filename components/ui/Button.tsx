import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "solid" | "outline" | "paper";
interface Props {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  type?: "button" | "submit";
  full?: boolean;
  ariaLabel?: string;
}

export default function Button({ children, href, onClick, variant = "solid", type = "button", full, ariaLabel }: Props) {
  const cls = `${styles.btn} ${styles[variant]} ${full ? styles.full : ""}`;
  if (href) return <Link href={href} className={cls} aria-label={ariaLabel}>{children}</Link>;
  return <button className={cls} onClick={onClick} type={type} aria-label={ariaLabel}>{children}</button>;
}
