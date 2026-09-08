/** Read-only reconciliation for owner alerts. Never changes payment/order verification. */
export async function followupPaymentState(email: string, createdAt: number): Promise<"paid" | "pending" | "unpaid"> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured");
  const options = () => ({
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store" as const, signal: AbortSignal.timeout(10_000),
  });
  const response = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(email)}`, options());
  const customer = await response.json();
  if (response.status === 404 && customer.status === false) return "unpaid";
  if (!response.ok || !customer.status || !Number.isSafeInteger(customer.data?.id)) {
    throw new Error("Could not check Paystack customer");
  }
  let pending = false;
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({
      customer: String(customer.data.id), perPage: "100", page: String(page),
      // Include a buffer for a transaction begun just before capture reached the server.
      from: new Date(createdAt - 60 * 60 * 1000).toISOString(),
    });
    const res = await fetch(`https://api.paystack.co/transaction?${query}`, options());
    const body = await res.json();
    if (!res.ok || !body.status || !Array.isArray(body.data)) throw new Error("Could not check Paystack payments");
    for (const payment of body.data) {
      // Unexpected identity/status is uncertainty, never permission to send an alert.
      if (payment.customer?.email?.trim().toLowerCase() !== email) throw new Error("Payment identity mismatch");
      if (payment.status === "success" || payment.status === "reversed") return "paid";
      if (!["failed", "abandoned"].includes(payment.status)) pending = true;
    }
    if (body.data.length < 100) return pending ? "pending" : "unpaid";
  }
  throw new Error("Paystack pagination limit reached");
}
