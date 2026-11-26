import { AdminError } from "./admin/store";
import { paystackEnvironment } from "./payments/paystackEventConfig";

export function orderStore(
  env: Record<string, string | undefined> = process.env,
): "redis" | "postgres" {
  const value = env.ORDER_STORE || "redis";
  if (value !== "redis" && value !== "postgres")
    throw new AdminError("Order storage configuration is invalid.", 503);
  if (value === "postgres") {
    if (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
      throw new AdminError("Order SQL access is disabled in previews.", 503);
    if (env.PAYSTACK_EVENT_STORE !== "postgres")
      throw new AdminError("SQL orders require durable payment ingestion.", 503);
    paystackEnvironment(env.PAYSTACK_SECRET_KEY);
  }
  return value;
}
export function ordersPaused() {
  const value = process.env.ORDER_PAUSED || "false";
  if (!["true", "false"].includes(value))
    throw new AdminError("Order pause configuration is invalid.", 503);
  return value === "true";
}
export function assertOrdersWritable() {
  orderStore();
  if (ordersPaused()) throw new AdminError("Order fulfilment is temporarily paused.", 503);
}
export async function orderDatabase() {
  const { postgresStore } = await import("./db/client");
  return postgresStore().db;
}
export async function sqlOrders() {
  const { orderDomain } = await import("./db/order-domain");
  return orderDomain(await orderDatabase(), paystackEnvironment());
}
