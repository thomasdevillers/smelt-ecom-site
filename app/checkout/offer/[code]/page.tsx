import type { Metadata } from "next";
import EmailOffer from "@/components/EmailOffer";

export const metadata: Metadata = {
  title: "Your Smelt offer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EmailOfferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <EmailOffer code={code} />;
}
