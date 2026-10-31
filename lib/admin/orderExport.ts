import { completionKey, listPaidTransactions, normalizeOrder } from "./orders";
import { AdminError, adminStore } from "./store";

const HEADERS = [
  "Order reference", "Paid date (SAST)", "Paid time (SAST)", "Customer name", "Customer email",
  "Items", "Hat quantity", "Currency", "Amount paid", "Paystack fees", "Payment channel",
  "Fulfilment status", "Completed at (SAST)", "Payment mode",
];

function csvCell(value: string | number) {
  if (typeof value === "number") return String(value);
  // Quoting alone does not stop spreadsheet applications evaluating formulas.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const localTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function paidDateTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return ["", ""];
  const parts = localTime.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return [`${part("year")}-${part("month")}-${part("day")}`, `${part("hour")}:${part("minute")}:${part("second")}`];
}

/** One row per successful payment. Amounts come from Paystack, never today's prices.
 * This is a sales reference, not a refund ledger or bank settlement report.
 */
export async function exportOrdersCsv() {
  const transactions = await listPaidTransactions();
  const completed = await adminStore().hgetall<Record<string, string>>(completionKey());
  const seen = new Set<string>();
  const orders = transactions.map(raw => {
    const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const order = normalizeOrder(data);
    if (!order.reference || data.status !== "success" || !Number.isSafeInteger(data.amount)
      || order.amount <= 0 || !/^[A-Z]{3}$/.test(order.currency)) {
      throw new AdminError("An order has invalid payment details. Check Paystack before exporting.", 502);
    }
    return { data, order };
  }).sort((a, b) => (a.order.paidAt || "").localeCompare(b.order.paidAt || "") || a.order.reference.localeCompare(b.order.reference));
  const rows: Array<Array<string | number>> = [HEADERS];
  for (const { data, order } of orders) {
    // Provider pages can overlap if an order arrives during the export.
    if (seen.has(order.reference)) continue;
    seen.add(order.reference);
    const completedAt = completed?.[order.reference] || null;
    const fees = typeof data.fees === "number" && Number.isSafeInteger(data.fees) && data.fees >= 0 ? (data.fees / 100).toFixed(2) : "";
    rows.push([
      order.reference, ...paidDateTime(order.paidAt), order.name, order.email,
      order.items.map(item => `${item.name} (${item.colour}) x ${item.qty}`).join("; "),
      order.items.length ? order.items.reduce((sum, item) => sum + item.qty, 0) : "", order.currency, (order.amount / 100).toFixed(2),
      fees, typeof data.channel === "string" ? data.channel : "", completedAt ? "Completed" : "Active",
      completedAt ? paidDateTime(completedAt).join(" ").trim() : "",
      process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
    ]);
  }
  // UTF-8 BOM preserves customer names in Excel; CRLF and quoting support commas/newlines.
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
