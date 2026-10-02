import { getDeliveryMap, type DeliveryAddress } from "@/lib/deliveryMap";
import styles from "./DeliveryMap.module.css";

export default function DeliveryMap({ address }: { address: DeliveryAddress }) {
  const { addressLines, mapsUrl, embedUrl } = getDeliveryMap(
    address,
    process.env.NEXT_PUBLIC_DELIVERY_MAP_ENABLED === "true"
      ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      : undefined,
  );

  return (
    <section className={styles.card} aria-labelledby="delivery-map-heading">
      <div className={styles.details}>
        <div className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <div className={styles.addressDetails}>
          <p className={styles.eyebrow}>Delivery destination</p>
          <h2 id="delivery-map-heading" className={styles.heading}>Your hat is headed here.</h2>
          <address className={styles.address}>
            {addressLines.map((line, index) => <span key={index}>{line}</span>)}
          </address>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={styles.link}>
            View in Google Maps <span aria-hidden="true">↗</span>
            <span className={styles.srOnly}> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      {embedUrl ? (
        <iframe
          className={styles.map}
          src={embedUrl}
          title="Map showing your delivery address"
          width="560"
          height="280"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : null}
    </section>
  );
}
