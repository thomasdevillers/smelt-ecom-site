export function paystackEventConfig(env: Record<string, string | undefined> = process.env) {
  const store = env.PAYSTACK_EVENT_STORE || "legacy";
  if (store !== "legacy" && store !== "postgres") throw new Error("Invalid Paystack event store.");
  const paused = env.PAYSTACK_EVENT_PAUSED || "false";
  if (!["true", "false"].includes(paused)) throw new Error("Invalid Paystack event pause.");
  if (store === "postgres" && env.VERCEL_ENV && env.VERCEL_ENV !== "production")
    throw new Error("Paystack SQL events are disabled in previews.");
  return { store, paused: paused === "true" };
}

export function paystackEnvironment(secret = process.env.PAYSTACK_SECRET_KEY) {
  if (secret?.startsWith("sk_live_")) return "live" as const;
  if (secret?.startsWith("sk_test_")) return "test" as const;
  throw new Error("Explicit Paystack live/test secret required.");
}
