"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMetaEvent } from "@/lib/metaPixel";

export default function MetaPageViewTracker() {
  const pathname = usePathname();
  const firstPageView = useRef(true);

  useEffect(() => {
    // The bootstrap snippet records the initial load. Only report subsequent
    // client-side navigations here so a page is never counted twice.
    if (firstPageView.current) {
      firstPageView.current = false;
      return;
    }
    trackMetaEvent("PageView");
  }, [pathname]);

  return null;
}
