// Server-only Paystack helper. Uses the Standard (redirect) flow:
// we initialize a transaction with the SECRET key and hand the browser an
// authorization_url to redirect to. No public key is needed on the client.
//
// Set PAYSTACK_SECRET_KEY in .env.local to go live. Until then, the app stays
// in "pre-order" mode and never calls Paystack.

const PAYSTACK_BASE = "https://api.paystack.co";

/** True once a secret key is configured. Gate all live-payment UI on this. */
export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export interface InitResult {
  authorizationUrl: string;
  reference: string;
}

/**
 * Initialize a transaction.
 * @param email    customer email (Paystack requires one)
 * @param amount   total in whole Rand (converted to cents here)
 * @param callbackUrl absolute URL Paystack redirects to after payment
 * @param metadata optional order details stored on the transaction
 */
export async function initializeTransaction(params: {
  email: string;
  amount: number;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      // Paystack expects the amount in the currency's subunit. ZAR -> cents.
      amount: Math.round(params.amount * 100),
      currency: "ZAR",
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(json?.message || "Paystack initialize failed");
  }
  return {
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference,
  };
}

export interface VerifyResult {
  status: string; // "success", "failed", "abandoned", ...
  reference: string;
  amount: number; // in cents, as returned by Paystack
  currency: string;
  paidAt: string | null;
  customerEmail: string | null;
  metadata: Record<string, unknown> | null;
}

/** Verify a transaction by reference after the customer returns from Paystack. */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey()}` } },
  );

  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(json?.message || "Paystack verify failed");
  }
  const d = json.data;
  return {
    status: d.status,
    reference: d.reference,
    amount: d.amount,
    currency: d.currency,
    paidAt: d.paid_at ?? null,
    customerEmail: d.customer?.email ?? null,
    metadata: d.metadata ?? null,
  };
}
