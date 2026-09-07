"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getTikTokClientContext, trackTikTokPage } from "@/lib/tiktokPixel";
import { trackMetaEvent } from "@/lib/metaPixel";

export default function MetaPageViewTracker() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    getTikTokClientContext(); // Capture ad attribution on the landing page.
    // The bootstrap records the initial load; only track actual route changes.
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    trackMetaEvent("PageView");
    trackTikTokPage();
  }, [pathname]);

  return null;
}
