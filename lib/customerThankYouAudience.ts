export interface CompletedCustomerOrder {
  reference: string;
  email: string;
  name: string;
  completedAt: string | null;
}

/** A completed order qualifies a customer even if they also have active orders. */
export function customerThankYouAudience(orders: CompletedCustomerOrder[]) {
  const customers = new Map<string, { email: string; name: string; references: string[] }>();
  let invalidEmails = 0;
  for (const order of [...orders].sort(
    (a, b) =>
      (a.completedAt || "").localeCompare(b.completedAt || "") ||
      a.reference.localeCompare(b.reference),
  )) {
    if (!order.completedAt) continue;
    const email = order.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
      invalidEmails++;
      continue;
    }
    const customer = customers.get(email);
    if (customer) {
      if (!customer.references.includes(order.reference)) customer.references.push(order.reference);
      if (!customer.name) customer.name = order.name.trim();
    } else customers.set(email, { email, name: order.name.trim(), references: [order.reference] });
  }
  return { customers: [...customers.values()], invalidEmails };
}
