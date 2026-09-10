import { SOCIAL_LINKS } from "@/content/social";
import styles from "./SocialLinks.module.css";

export default function SocialLinks() {
  return (
    <div className={styles.links}>
      {SOCIAL_LINKS.map((social) => (
        <a key={social.label} href={social.href}>
          {social.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}
