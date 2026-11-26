import type { Metadata } from "next";
import ReviewForm from "@/components/ReviewForm";

export const metadata: Metadata = {
  title: "Review your Smelt hat",
  description: "Share your experience with your Smelt sauna hat.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReviewForm token={token} />;
}
