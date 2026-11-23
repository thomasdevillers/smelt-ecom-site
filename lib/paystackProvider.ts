import { paystackEnvironment } from "./paystackEventConfig";

/** Internal GET-only provider client. No create/refund/resolve endpoints. */
export async function readPaystack(path: string) {
  paystackEnvironment();
  if (!/^\/(transaction|refund|dispute)(\/|\?|$)/.test(path)) throw new Error("Unsupported Paystack read.");
  const response = await fetch(`https://api.paystack.co${path}`, { method: "GET", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Paystack read unavailable.");
  const body = await response.json();
  if (body?.status !== true) throw new Error("Paystack read unavailable.");
  return body;
}
