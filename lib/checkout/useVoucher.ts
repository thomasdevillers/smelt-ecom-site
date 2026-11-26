"use client";
import { useEffect, useState } from "react";
import { grandTotal, type ShippingMethod } from "../pricing";
import type { CartState } from "../cartReducer";
import { EMAIL_VOUCHER_STORAGE_KEY } from "./cartRecoveryShared";

type AppliedVoucher = {
  code: string;
  amount: number;
  expiresAt: string;
  email: string;
  hatCount: number;
};

export function useVoucher(
  email: string,
  cart: CartState,
  subtotal: number,
  shippingMethod: ShippingMethod,
) {
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState("");
  const [voucherAttempt, setVoucherAttempt] = useState(0);
  const normalizedVoucherCode = voucherCode.trim().toUpperCase().replace(/\s+/g, "");
  const voucherEmail = normalizedVoucherCode.startsWith("SMELT-") ? email.trim().toLowerCase() : "";
  const activeVoucher =
    appliedVoucher &&
    appliedVoucher.hatCount === cart.green + cart.cream &&
    appliedVoucher.email === voucherEmail &&
    appliedVoucher.code === normalizedVoucherCode &&
    appliedVoucher.amount < grandTotal(subtotal, cart.green + cart.cream, shippingMethod)
      ? appliedVoucher
      : null;
  const totalAmount =
    grandTotal(subtotal, cart.green + cart.cream, shippingMethod) - (activeVoucher?.amount ?? 0);

  useEffect(() => {
    if (!normalizedVoucherCode || !voucherAttempt) return;
    if (
      normalizedVoucherCode.startsWith("SMELT-") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(voucherEmail)
    )
      return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setVoucherBusy(true);
      setVoucherError("");
      try {
        const response = await fetch("/api/vouchers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            code: normalizedVoucherCode,
            email: voucherEmail,
            cart: { green: cart.green, cream: cart.cream },
          }),
        });
        const result = (await response.json()) as {
          code?: string;
          amount?: number;
          expiresAt?: string;
          error?: string;
        };
        if (!response.ok || !result.code || !result.amount)
          throw new Error(result.error || "Could not apply this code.");
        if (result.amount >= grandTotal(subtotal, cart.green + cart.cream, shippingMethod))
          throw new Error("This discount must be less than your order total.");
        if (!cancelled)
          setAppliedVoucher({
            code: result.code,
            amount: result.amount,
            expiresAt: result.expiresAt ?? "",
            email: voucherEmail,
            hatCount: cart.green + cart.cream,
          });
      } catch (caught) {
        if (!cancelled) {
          setAppliedVoucher(null);
          setVoucherError(
            caught instanceof Error ? caught.message : "Could not apply this code. Try again.",
          );
        }
      } finally {
        if (!cancelled) setVoucherBusy(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    normalizedVoucherCode,
    voucherEmail,
    voucherAttempt,
    subtotal,
    cart.green,
    cart.cream,
    shippingMethod,
  ]);

  function clearVoucher() {
    setVoucherCode("");
    setAppliedVoucher(null);
    setVoucherError("");
    setVoucherBusy(false);
    setVoucherAttempt(0);
    try {
      sessionStorage.removeItem(EMAIL_VOUCHER_STORAGE_KEY);
    } catch {
      /* Memory fallback. */
    }
  }
  return {
    voucherCode,
    setVoucherCode,
    setAppliedVoucher,
    voucherBusy,
    setVoucherBusy,
    voucherError,
    setVoucherError,
    voucherAttempt,
    setVoucherAttempt,
    normalizedVoucherCode,
    activeVoucher,
    totalAmount,
    clearVoucher,
  };
}
