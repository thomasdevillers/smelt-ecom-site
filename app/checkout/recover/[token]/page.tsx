import type { Metadata } from "next";
import CartRecovery from "@/components/CartRecovery";
import { getCartRecovery } from "@/lib/cartEmailSequence";

export const metadata: Metadata = {
  title: "Restore your Smelt cart",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CartRecoveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data = null;
  try { data = await getCartRecovery(token); } catch { /* Keep private storage failures generic. */ }
  return <CartRecovery data={data} />;
}
