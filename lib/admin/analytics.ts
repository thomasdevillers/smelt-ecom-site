import { AdminError } from "./store";
import type { AnalyticsDays, AnalyticsPeriod, ArticlePeriod, ConversionAnalytics } from "./types";
import { normalizeOrder } from "./orders";
import { attributionChannel, type AttributionChannel } from "../attribution";
import { GUIDES } from "@/content/guides";

const DAY_MS = 24 * 60 * 60 * 1000;
const VERCEL_MAX_DAILY_DAYS = 62;
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

async function vercelData(dataset: "visits" | "events", params: Record<string, string>): Promise<unknown> {
  const { token, projectId, teamId } = config();
  const query = new URLSearchParams({ projectId, ...params });
  if (teamId) query.set("teamId", teamId);
  // Log only query context and bounded provider error fields, never credentials
  // or the response data (which can contain visitor information).
  const logFailure = (details: Record<string, unknown>) => console.error("Vercel analytics request failed", {
    dataset, since: params.since, until: params.until, by: params.by, filter: params.filter,
    ...details,
  });
  const safeText = (value: unknown) => typeof value === "string" ? value.replaceAll(token, "[REDACTED]").slice(0, 1000) : undefined;
  let response: Response;
  try {
    response = await fetch(`https://api.vercel.com/v1/query/web-analytics/${dataset}/aggregate?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    logFailure({ reason: "fetch_failed", errorName: error instanceof Error ? safeText(error.name) : "Unknown error" });
    throw error;
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body || typeof body !== "object" || !("data" in body)) {
    const providerError = body && typeof body === "object" && "error" in body ? body.error : undefined;
    const fields = providerError && typeof providerError === "object" ? providerError as Record<string, unknown> : {};
    logFailure({
      status: response.status,
      reason: response.ok ? "invalid_response" : "upstream_error",
      errorCode: safeText(fields.code),
      errorMessage: safeText(fields.message) ?? safeText(providerError),
    });
    if (response.status === 401 || response.status === 403) throw new AdminError("Vercel rejected the analytics credentials. Check the access token and team ID.", 503);
    throw new AdminError("Could not load traffic data from Vercel. Please try again.", 502);
  }
  if (!Array.isArray(body.data)) {
    logFailure({ status: response.status, reason: "invalid_data_shape" });
  }
  return body.data;
}

async function vercelDailyData(dataset: "visits" | "events", params: Record<string, string>) {
  // Vercel rejects daily queries longer than 62 days. Split on UTC date
  // boundaries, preserving explicit time bounds used by article readership.
  const end = params.until.slice(0, 10);
  const requests: Promise<unknown[]>[] = [];
  for (let start = params.since.slice(0, 10); start <= end;) {
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const chunkEnd = shiftDays(startDate, VERCEL_MAX_DAILY_DAYS - 1).toISOString().slice(0, 10);
    const until = chunkEnd < end ? chunkEnd : end;
    requests.push(vercelData(dataset, {
      ...params, by: "day",
      since: start + params.since.slice(10),
      until: until + params.until.slice(10),
    }).then(data => {
      if (!Array.isArray(data)) throw new AdminError("Could not load traffic data from Vercel. Please try again.", 502);
      return data;
    }));
    start = shiftDays(startDate, VERCEL_MAX_DAILY_DAYS).toISOString().slice(0, 10);
  }
  return (await Promise.all(requests)).flat();
}

async function vercelDaily(dataset: "visits" | "events", since: string, until: string, eventName?: FunnelEvent) {
  const data = await vercelDailyData(dataset, {
    since, until, limit: "100",
    filter: eventName ? `eventName eq '${eventName}'` : "requestPath ne '/admin'",
  });
  if (!Array.isArray(data)) throw new AdminError("Could not load traffic data from Vercel. Please try again.", 502);
  return data as DailyMetric[];
}

async function articleTraffic(start: string, end: string): Promise<ArticlePeriod> {
  const pages = GUIDES.map(guide => ({ path: `/articles/${guide.slug}`, title: guide.h1, views: 0, visitors: 0 }));
  if (!pages.length) return { views: 0, visitors: 0, pages };
  // Exact published paths exclude the article index and unknown/404 URLs.
  const filter = `requestPath in (${pages.map(page => `'${page.path.replaceAll("'", "''")}'`).join(",")})`;
  // Vercel aggregates daily traffic in UTC. Use the same complete date bounds
  // for both queries; the count endpoint rounds its end date differently.
  const range = { since: `${start}T00:00:00.000Z`, until: `${end}T23:59:59.999Z`, filter, limit: "100" };
  const [totals, rows] = await Promise.all([
    vercelDailyData("visits", range),
    vercelData("visits", { ...range, by: "requestPath" }),
  ]);
  const metrics = (value: unknown) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (typeof row.pageviews !== "number" || !Number.isSafeInteger(row.pageviews) || row.pageviews < 0
      || typeof row.visitors !== "number" || !Number.isSafeInteger(row.visitors) || row.visitors < 0) {
      throw new AdminError("Article readership data could not be read. Please try again.", 502);
    }
    return { views: row.pageviews, visitors: row.visitors };
  };
  if (!Array.isArray(rows) || !Array.isArray(totals)) throw new AdminError("Article readership data could not be read. Please try again.", 502);
  const byPath = new Map(pages.map(page => [page.path, page]));
  for (const value of rows) {
    if (!value || typeof value !== "object" || typeof value.requestPath !== "string") {
      throw new AdminError("Article readership data could not be read. Please try again.", 502);
    }
    const page = byPath.get(value.requestPath);
    if (page) Object.assign(page, metrics(value));
  }
  // Query the combined audience: adding per-article readers would count people
  // who opened multiple articles more than once on the same day.
  const total = { views: 0, visitors: 0 };
  for (const row of totals) {
    if (!row || typeof row !== "object" || !("timestamp" in row) || typeof row.timestamp !== "string") throw new AdminError("Article readership data could not be read. Please try again.", 502);
    const day = row.timestamp.slice(0, 10);
    if (day < start || day > end) continue;
    const value = metrics(row);
    total.views += value.views;
    total.visitors += value.visitors;
  }
  return { ...total, pages: pages.sort((a, b) => b.views - a.views || a.title.localeCompare(b.title)) };
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
  const channels = new Map<AttributionChannel, { channel: AttributionChannel; orders: number; revenue: number }>();
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
    const channel = attributionChannel(order.attribution?.lastTouch);
    const total = channels.get(channel) ?? { channel, orders: 0, revenue: 0 };
    total.orders++; total.revenue += amount;
    channels.set(channel, total);
  }
  return { orders, revenue, channels: [...channels.values()].sort((a, b) => b.revenue - a.revenue || a.channel.localeCompare(b.channel)) };
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
  const [currentTraffic, previousTraffic, transactions, articleReport] = await Promise.all([
    trafficForRange(ranges.current.start, ranges.current.end),
    trafficForRange(ranges.previous.start, ranges.previous.end),
    paidTransactions(previousStart, now),
    Promise.all([
      articleTraffic(ranges.current.start, ranges.current.end),
      articleTraffic(ranges.previous.start, ranges.previous.end),
    ]).then(([current, previous]) => ({ articles: { current, previous }, articlesError: null }))
      .catch((error: unknown) => ({ articles: null, articlesError: error instanceof AdminError ? error.message : "Could not load article readership. Please try again." })),
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
    ...articleReport,
  };
}
