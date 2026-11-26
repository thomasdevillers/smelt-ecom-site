import type { Mode, PaystackCapture } from "./order-plan";

/** GET-only, all statuses, all pages. Never calls notification/fulfilment code. */
export async function capturePaystackOrders(
  secret: string,
  environment: Mode,
  request = fetch,
): Promise<PaystackCapture> {
  if (!secret.startsWith(`sk_${environment}_`))
    throw new Error("Paystack key does not match explicit capture environment.");
  const startedAt = new Date().toISOString(),
    transactions: unknown[] = [],
    seen = new Set<string>();
  let total: number | undefined, pages: number | undefined;
  for (let page = 1; page <= 10_000; page++) {
    const query = new URLSearchParams({ perPage: "100", page: String(page) });
    const response = await request(`https://api.paystack.co/transaction?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("Paystack capture request failed.");
    const body = await response.json();
    if (
      body.status !== true ||
      !Array.isArray(body.data) ||
      !Number.isSafeInteger(body.meta?.total) ||
      body.meta.total < 0 ||
      !Number.isSafeInteger(body.meta?.pageCount) ||
      body.meta.pageCount < 0
    )
      throw new Error("Invalid Paystack pagination.");
    total ??= body.meta.total;
    pages ??= body.meta.pageCount;
    if (
      total !== body.meta.total ||
      pages !== body.meta.pageCount ||
      (!body.data.length && page < pages!)
    )
      throw new Error("Paystack changed during capture; capture again.");
    for (const row of body.data) {
      if (
        !row ||
        row.domain !== environment ||
        typeof row.reference !== "string" ||
        seen.has(row.reference)
      )
        throw new Error("Ambiguous or overlapping Paystack capture.");
      seen.add(row.reference);
      transactions.push(row);
    }
    if (page >= pages!) {
      if (transactions.length !== total) throw new Error("Incomplete Paystack capture.");
      return {
        version: 1,
        environment,
        startedAt,
        completedAt: new Date().toISOString(),
        total: total!,
        transactions,
      };
    }
  }
  throw new Error("Paystack page limit reached; capture is incomplete.");
}
