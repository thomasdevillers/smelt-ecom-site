import { Suspense } from "react";
import AttributionTracker from "@/components/AttributionTracker";
import StoreAnalytics from "@/components/StoreAnalytics";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AttributionTracker />
      </Suspense>
      {children}
      <StoreAnalytics />
    </>
  );
}
