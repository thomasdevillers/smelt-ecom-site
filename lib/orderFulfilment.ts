import { adminStore } from "./admin/store";
import { completionKey } from "./admin/orders";
import { orderStore, sqlOrders } from "./orderPersistence";

export async function completedOrderDates() {
  if (orderStore() === "postgres") return (await sqlOrders()).completedDates();
  return (await adminStore().hgetall<Record<string, string>>(completionKey())) || {};
}
export async function orderCompletedAt(reference: string) {
  if (orderStore() === "postgres")
    return (await (await sqlOrders()).completedDates(reference))[reference] ?? null;
  return adminStore().hget<string>(completionKey(), reference);
}
