"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureBrowserAttribution } from "@/lib/attributionClient";

export default function AttributionTracker() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => { captureBrowserAttribution(); }, [pathname, query]);
  return null;
}
