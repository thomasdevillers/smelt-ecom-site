import type { Metadata } from "next";
import CustomHatDesigner from "@/components/customHats/CustomHatDesigner";

export const metadata: Metadata = {
  title: "Design your custom hats",
  description:
    "Choose a felt colour, add your logo and tag, and send us your custom Smelt hat designs.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CustomHatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomHatDesigner token={token} />;
}
