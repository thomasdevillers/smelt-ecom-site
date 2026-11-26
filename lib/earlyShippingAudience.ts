import type { AdminOrder } from "./admin/types";

export function eligibleEarlyShippingOrder(order: AdminOrder): boolean {
  return (
    !!order.preorder &&
    !order.completedAt &&
    !order.receipt &&
    order.amount > 0 &&
    order.currency === "ZAR" &&
    order.items.length > 0 &&
    /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(order.email) &&
    (!order.reviewReason ||
      order.reviewReason === "This order uses a different delivery method." ||
      order.reviewReason.includes(
        "Confirm the hats have been received in Restock requests before sending tracking.",
      ))
  );
}

export function earlyShippingAudience(orders: AdminOrder[]) {
  const customers = new Map<string, { email: string; references: string[] }>();
  const excluded: string[] = [];
  for (const order of orders) {
    if (!eligibleEarlyShippingOrder(order)) {
      excluded.push(order.reference);
      continue;
    }
    const email = order.email.trim().toLowerCase();
    const customer = customers.get(email) || { email, references: [] };
    if (!customer.references.includes(order.reference)) customer.references.push(order.reference);
    customers.set(email, customer);
  }
  return { customers: [...customers.values()], excluded };
}
