import SectionLabel from "./ui/SectionLabel";
import { POLICIES } from "@/content/policies";
import styles from "./Policies.module.css";

export default function Policies() {
  return (
    <section id="policies" className={styles.section}>
      <div className={styles.header}>
        <SectionLabel>{POLICIES.eyebrow}</SectionLabel>
        <h2 className={styles.h2}>{POLICIES.title}</h2>
        <p className={styles.intro}>{POLICIES.intro}</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.card} id="shipping-policy">
          <h3 className={styles.cardTitle}>{POLICIES.shipping.title}</h3>

          <div className={styles.item}>
            <span className={styles.itemLabel}>Dispatch</span>
            <p className={styles.itemText}>{POLICIES.shipping.dispatch}</p>
          </div>

          <div className={styles.item}>
            <span className={styles.itemLabel}>Delivery Service</span>
            <p className={styles.itemText}>{POLICIES.shipping.courier}</p>
            <div className={styles.timelines}>
              {POLICIES.shipping.timelines.map((t) => (
                <div key={t.area} className={styles.timelineRow}>
                  <span className={styles.area}>{t.area}</span>
                  <span className={styles.time}>{t.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.item}>
            <span className={styles.itemLabel}>Tracking</span>
            <p className={styles.itemText}>{POLICIES.shipping.tracking}</p>
          </div>
        </div>

        <div className={styles.card} id="returns-policy">
          <h3 className={styles.cardTitle}>{POLICIES.returns.title}</h3>

          <div className={styles.hygieneBox}>
            <div className={styles.hygieneLabel}>Hygiene Policy</div>
            <p className={styles.itemText}>{POLICIES.returns.hygiene}</p>
          </div>

          <div className={styles.item}>
            <span className={styles.itemLabel}>Unopened Items</span>
            <p className={styles.itemText}>{POLICIES.returns.unopened}</p>
          </div>

          <div className={styles.item}>
            <span className={styles.itemLabel}>Defective Goods</span>
            <p className={styles.itemText}>
              We stand by the quality of our products. If your hat arrives damaged or has a manufacturing defect, please contact us within 7 days of delivery. Email{" "}
              <a className={styles.emailLink} href="mailto:returns@saunahat.co.za">
                returns@saunahat.co.za
              </a>{" "}
              with your order number and clear photos of the issue. We will arrange collection at our cost and provide either a full refund or a free replacement. <small>(Note: This does not cover normal wear and tear or improper washing).</small>
            </p>
          </div>
        </div>
      </div>

      <div className={styles.signoff}>{POLICIES.signoff}</div>
    </section>
  );
}
