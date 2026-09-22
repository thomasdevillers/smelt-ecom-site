import type { Metadata } from "next";
import CartEmailUnsubscribe from "@/components/CartEmailUnsubscribe";

export const metadata: Metadata = {
  title: "Email preferences | Smelt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CartEmailUnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CartEmailUnsubscribe token={token} />;
}
