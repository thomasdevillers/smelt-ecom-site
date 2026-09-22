"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EMAIL_VOUCHER_STORAGE_KEY } from "@/lib/cartRecoveryShared";

export default function EmailOffer({ code }: { code: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(EMAIL_VOUCHER_STORAGE_KEY, code);
      router.replace("/product");
    } catch { queueMicrotask(() => setFailed(true)); }
  }, [code, router]);
  return <main style={{ padding: "48px 20px", maxWidth: 640, margin: "0 auto" }}>
    <h1>{failed ? "We couldn’t save your offer." : "Getting your offer ready…"}</h1>
    <p>{failed ? "Please open this email link in a browser with storage enabled to apply your discount." : "Your discount will apply automatically at checkout when you use the email address that received this offer."}</p>
  </main>;
}
