import type { Metadata } from "next";
import ReviewAccessForm from "@/components/ReviewAccessForm";

export const metadata: Metadata = {
  title: "Write a review | Smelt",
  description: "Verify your Smelt order and share your sauna hat experience.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReviewAccessPage() {
  return <ReviewAccessForm />;
}
