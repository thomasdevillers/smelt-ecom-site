import { AdminError } from "./store";
import type { AnalyticsDays, AnalyticsPeriod, ConversionAnalytics } from "./types";
import { normalizeOrder } from "./orders";

const DAY_MS = 24 * 60 * 60 * 1000;
const JOHANNESBURG_OFFSET_MS = 2 * 60 * 60 * 1000;
type FunnelEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "PaymentOpened" | "PaymentCancelled" | "CheckoutError";

type DailyMetric = { timestamp?: unknown; visitors?: unknown };
type PaidTransaction = { reference?: unknown; status?: unknown; amount?: unknown; currency?: unknown; paid_at?: unknown };

function dateKey(value: Date) {
  return new Date(value.getTime() + JOHANNESBURG_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfJohannesburgDay(value: Date) {
  const localDate = dateKey(value);
  return new Date(`${localDate}T00:00:00+02:00`);
}

function shiftDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function config() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  if (!token || !projectId) {
    throw new AdminError("Analytics needs a Vercel access token and project ID. Add them in the project environment settings.", 503);
  }
  return { token, projectId, teamId };
}

async function vercelDaily(dataset: "visits" | "events", since: string, until: string, eventName?: FunnelEvent) {
  const { token, projectId, teamId } = config();
  const query = new URLSearchParams({ projectId, since, until, by: "day", limit: "100" });
  if (teamId) query.set("teamId", teamId);
  if (eventName) query.set("filter", `eventName eq '${eventName}'`);
  else query.set("filter", "requestPath ne '/admin'");
  const response = await fetch(`https://api.vercel.com/v1/query/web-analytics/${dataset}/aggregate?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  const data = body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
    ? (body as { data: DailyMetric[] }).data : null;
  if (!response.ok || !data) {
    if (response.status === 401 || response.status === 403) throw new AdminError("Vercel rejected the analytics credentials. Check the access token and team ID.", 503);
    throw new AdminError("Could not load traffic data from Vercel. Please try again.", 502);
  }
  return data;
}

async function trafficForRange(start: string, end: string) {
  const [visitors, productViews, addToCarts, checkoutStarts, paymentOpened, paymentCancelled, checkoutErrors] = await Promise.all([
    vercelDaily("visits", start, end),
    vercelDaily("events", start, end, "ViewContent"),
    vercelDaily("events", start, end, "AddToCart"),
    vercelDaily("events", start, end, "InitiateCheckout"),
    vercelDaily("events", start, end, "PaymentOpened"),
    vercelDaily("events", start, end, "PaymentCancelled"),
    vercelDaily("events", start, end, "CheckoutError"),
  ]);
  return { visitors, productViews, addToCarts, checkoutStarts, paymentOpened, paymentCancelled, checkoutErrors };
}

async function paidTransactions(from: Date, to: Date) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new AdminError("Order access has not been configured.", 503);
  const transactions: PaidTransaction[] = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({
      status: "success",
      perPage: "100",
      page: String(page),
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const response = await fetch(`https://api.paystack.co/transaction?${query}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    let body: { status?: unknown; data?: unknown; meta?: { pageCount?: unknown } } | null = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.status !== true || !Array.isArray(body.data)) {
      throw new AdminError("Could not load sales data from Paystack. Please try again.", 502);
    }
    transactions.push(...body.data as PaidTransaction[]);
    const pageCount = body.meta?.pageCount;
    if (!Number.isSafeInteger(pageCount) || page >= Number(pageCount)) return transactions;
  }
  throw new AdminError("Paystack returned too many transaction pages for this report.", 502);
}

function sumVisitors(rows: DailyMetric[], start: string, end: string) {
  return rows.reduce((total, row) => {
    const day = typeof row.timestamp === "string" ? row.timestamp.slice(0, 10) : "";
    const visitors = typeof row.visitors === "number" && Number.isFinite(row.visitors) ? row.visitors : 0;
    return day >= start && day <= end ? total + visitors : total;
  }, 0);
}

function sales(transactions: PaidTransaction[], start: string, end: string) {
  const seen = new Set<string>();
  let orders = 0, revenue = 0;
  for (const transaction of transactions) {
    const order = normalizeOrder(transaction);
    const reference = order.reference;
    const paidAt = order.paidAt ? new Date(order.paidAt) : null;
    if (!reference || seen.has(reference) || !order.items.length || !paidAt || !Number.isFinite(paidAt.getTime()) || transaction.status !== "success" || order.currency !== "ZAR") continue;
    const day = dateKey(paidAt);
    if (day < start || day > end) continue;
    const amount = Number.isFinite(order.amount) && order.amount > 0 ? order.amount : 0;
    if (!amount) continue;
    seen.add(reference); orders++; revenue += amount;
  }
  return { orders, revenue };
}

export async function getConversionAnalytics(days: AnalyticsDays, now = new Date()): Promise<ConversionAnalytics> {
  const today = startOfJohannesburgDay(now);
  const currentStart = shiftDays(today, -(days - 1));
  const previousEnd = shiftDays(currentStart, -1);
  const previousStart = shiftDays(previousEnd, -(days - 1));
  const ranges = {
    current: { start: dateKey(currentStart), end: dateKey(today) },
    previous: { start: dateKey(previousStart), end: dateKey(previousEnd) },
  };
  const [currentTraffic, previousTraffic, transactions] = await Promise.all([
    trafficForRange(ranges.current.start, ranges.current.end),
    trafficForRange(ranges.previous.start, ranges.previous.end),
    paidTransactions(previousStart, now),
  ]);
  const build = ({ start, end }: { start: string; end: string }, traffic: Awaited<ReturnType<typeof trafficForRange>>): AnalyticsPeriod => ({
    start, end,
    visitors: sumVisitors(traffic.visitors, start, end),
    productViews: sumVisitors(traffic.productViews, start, end),
    addToCarts: sumVisitors(traffic.addToCarts, start, end),
    checkoutStarts: sumVisitors(traffic.checkoutStarts, start, end),
    paymentOpened: sumVisitors(traffic.paymentOpened, start, end),
    paymentCancelled: sumVisitors(traffic.paymentCancelled, start, end),
    checkoutErrors: sumVisitors(traffic.checkoutErrors, start, end),
    ...sales(transactions, start, end),
  });
  return {
    days,
    generatedAt: now.toISOString(),
    mode: process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
    current: build(ranges.current, currentTraffic),
    previous: build(ranges.previous, previousTraffic),
  };
}
