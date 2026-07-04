import type { Metadata } from "next";
import ContactClient from "@/components/ContactClient";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about your Smelt sauna hat, a pre-order, or a return? Get in touch — we usually reply within a day or two. Warm regards from Cape Town.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
