import Policies from "@/components/Policies";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo";
import styles from "./policies.module.css";

export const metadata = {
  title: { absolute: "Store Policies · Shipping, Delivery & Returns | Smelt" },
  description:
    "Smelt store policies: 1–3 day dispatch nationwide via The Courier Guy, 7-day unopened returns, and 6-month defect guarantee for our wool felt sauna hats.",
  alternates: { canonical: "/policies" },
};

const crumbsLd = breadcrumbLd([
  ["Home", "/"],
  ["Policies", "/policies"],
]);

export default function PoliciesPage() {
  return (
    <main className={styles.page}>
      <script {...jsonLdScript(crumbsLd)} />
      <Policies />
    </main>
  );
}
