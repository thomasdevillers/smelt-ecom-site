import type PaystackInline from "@paystack/inline-js";

export type PendingPayment = {
  orderKey: string;
  accessCode?: string;
  authorizationUrl: string;
  startedAt: number;
};
// Stay inside the server's one-hour stock reservation when reopening a popup.
const PAYMENT_REUSE_MS = 30 * 60 * 1000;
export const isReusablePayment = (
  payment: PendingPayment | null,
  orderKey: string,
): payment is PendingPayment =>
  payment?.orderKey === orderKey && Date.now() - payment.startedAt < PAYMENT_REUSE_MS;
export const startedPayment = (payment: Omit<PendingPayment, "startedAt">): PendingPayment => ({
  ...payment,
  startedAt: Date.now(),
});

/** Keep the hosted-page fallback when a browser cannot load the popup SDK. */
export async function openPayment(
  payment: PendingPayment,
  onSuccess: (reference: string) => void,
  onCancel: () => void,
) {
  const redirect = () => window.location.assign(payment.authorizationUrl);
  if (!payment.accessCode) return redirect();
  let PaystackPop: typeof PaystackInline;
  try {
    PaystackPop = (await import("@paystack/inline-js")).default;
  } catch {
    return redirect();
  }
  new PaystackPop().resumeTransaction(payment.accessCode, {
    onSuccess: (transaction) => onSuccess(transaction.reference),
    onCancel,
    onError: redirect,
  });
}
