export type ReviewNamespace = "live" | "test";

export function reviewNamespace(): ReviewNamespace {
  return process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
}
