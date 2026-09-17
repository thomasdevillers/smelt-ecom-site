"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyticsDays, AnalyticsPeriod, ConversionAnalytics } from "@/lib/admin/types";
import styles from "./admin.module.css";

class AnalyticsError extends Error { constructor(message: string, public status: number) { super(message); } }

const percent = (part: number, whole: number) => whole > 0 ? part / whole * 100 : 0;
const formatPercent = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)}%`;
const formatNumber = (value: number) => new Intl.NumberFormat("en-ZA").format(value);
const formatMoney = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const shortDate = (value: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date(`${value}T12:00:00+02:00`));

function change(current: number, previous: number, points = false) {
  if (!previous) return { label: current ? "New this period" : "No prior baseline", direction: "flat" as const };
  const difference = points ? current - previous : (current - previous) / previous * 100;
  const prefix = difference > 0 ? "+" : "";
  return {
    label: points ? `${prefix}${difference.toFixed(1)} pts vs prior` : `${prefix}${difference.toFixed(1)}% vs prior`,
    direction: difference > 0 ? "up" as const : difference < 0 ? "down" as const : "flat" as const,
  };
}

function Metric({ label, value, note, trend }: { label: string; value: string; note: string; trend?: ReturnType<typeof change> }) {
  return <article className={styles.metric}>
    <span>{label}</span>
    <strong>{value}</strong>
    <div><small>{note}</small>{trend && <small className={trend.direction === "up" ? styles.trendUp : trend.direction === "down" ? styles.trendDown : ""}>{trend.label}</small>}</div>
  </article>;
}

function derived(period: AnalyticsPeriod) {
  return {
    storeConversion: percent(period.orders, period.visitors),
    productConversion: percent(period.orders, period.productViews),
    cartRate: percent(period.addToCarts, period.productViews),
    cartToCheckout: percent(period.checkoutStarts, period.addToCarts),
    paymentOpenRate: percent(period.paymentOpened, period.checkoutStarts),
    paymentCompletion: percent(period.orders, period.paymentOpened),
    averageOrder: period.orders ? period.revenue / period.orders : 0,
    revenuePerVisitor: period.visitors ? period.revenue / period.visitors : 0,
  };
}

export default function AnalyticsPanel({ onExpired }: { onExpired: () => void }) {
  const [days, setDays] = useState<AnalyticsDays>(28);
  const [data, setData] = useState<ConversionAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/analytics?days=${days}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new AnalyticsError(body.error || "Could not load store performance.", response.status);
      if (generation.current === current) setData(body);
    } catch (cause) {
      if (generation.current !== current) return;
      if (cause instanceof AnalyticsError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Could not load store performance.");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [days, onExpired]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; invalidate(); };
  }, [load, invalidate]);

  const current = data ? derived(data.current) : null;
  const previous = data ? derived(data.previous) : null;
  const conversionTrend = current && previous ? change(current.storeConversion, previous.storeConversion, true) : null;
  const funnel = data ? [
    { label: "Store visitors", value: data.current.visitors, note: "Daily unique visitors" },
    { label: "Product viewers", value: data.current.productViews, note: `${formatPercent(percent(data.current.productViews, data.current.visitors))} of visitors` },
    { label: "Added to bag", value: data.current.addToCarts, note: `${formatPercent(current!.cartRate)} of product viewers` },
    { label: "Started checkout", value: data.current.checkoutStarts, note: `${formatPercent(current!.cartToCheckout)} of shoppers who added` },
    { label: "Opened payment", value: data.current.paymentOpened, note: `${formatPercent(current!.paymentOpenRate)} of checkout visitors` },
    { label: "Paid orders", value: data.current.orders, note: `${formatPercent(current!.paymentCompletion)} of payment openers` },
  ] : [];

  return <section className={styles.analytics} aria-labelledby="analytics-title">
    <div className={styles.analyticsToolbar}>
      <div className={styles.rangePicker} aria-label="Analytics period">
        {([7, 28, 90] as AnalyticsDays[]).map(option => <button key={option} type="button" aria-pressed={days === option} disabled={loading} onClick={() => setDays(option)}>{option} days</button>)}
      </div>
      <button className={styles.refresh} type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh report ↻"}</button>
    </div>
    {error && <div className={styles.analyticsError} role="alert"><strong>Report unavailable</strong><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div>}
    {loading && !data && <div className={styles.analyticsLoading} role="status"><span />Reading Vercel traffic and Paystack sales…</div>}
    {data && current && previous && <>
      <div className={styles.reportMeta}>
        <h2 id="analytics-title"><strong>{shortDate(data.current.start)} — {shortDate(data.current.end)}</strong><span>compared with {shortDate(data.previous.start)} — {shortDate(data.previous.end)}</span></h2>
        <span className={`${styles.dataMode} ${data.mode === "test" ? styles.testMode : ""}`}>{data.mode === "live" ? "LIVE PAYMENTS" : "TEST PAYMENTS"}</span>
      </div>
      <div className={styles.conversionHero}>
        <div><span>STORE CONVERSION</span><strong>{formatPercent(current.storeConversion)}</strong></div>
        <div className={styles.heroContext}><p><strong>{formatNumber(data.current.orders)}</strong> paid {data.current.orders === 1 ? "order" : "orders"}</p><span>from {formatNumber(data.current.visitors)} daily unique visitors</span>{conversionTrend && <small className={conversionTrend.direction === "up" ? styles.trendUp : conversionTrend.direction === "down" ? styles.trendDown : ""}>{conversionTrend.label}</small>}</div>
      </div>
      <div className={styles.metricGrid}>
        <Metric label="Revenue" value={formatMoney(data.current.revenue)} note="Successful ZAR payments" trend={change(data.current.revenue, data.previous.revenue)} />
        <Metric label="Average order" value={formatMoney(current.averageOrder)} note="Revenue per paid order" trend={change(current.averageOrder, previous.averageOrder)} />
        <Metric label="Revenue / visitor" value={formatMoney(current.revenuePerVisitor)} note="Commercial yield" trend={change(current.revenuePerVisitor, previous.revenuePerVisitor)} />
        <Metric label="Product conversion" value={formatPercent(current.productConversion)} note="Orders / product viewers" trend={change(current.productConversion, previous.productConversion, true)} />
        <Metric label="Add-to-bag rate" value={formatPercent(current.cartRate)} note="Unique adders / viewers" trend={change(current.cartRate, previous.cartRate, true)} />
        <Metric label="Cart → checkout" value={formatPercent(current.cartToCheckout)} note="Checkout visitors / adders" trend={change(current.cartToCheckout, previous.cartToCheckout, true)} />
        <Metric label="Payment-open rate" value={formatPercent(current.paymentOpenRate)} note="Payment openers / checkout visitors" trend={change(current.paymentOpenRate, previous.paymentOpenRate, true)} />
        <Metric label="Payment completion" value={formatPercent(current.paymentCompletion)} note="Orders / payment openers" trend={change(current.paymentCompletion, previous.paymentCompletion, true)} />
      </div>
      <section className={styles.funnelSection} aria-labelledby="funnel-title">
        <div className={styles.sectionIntro}><span>PATH TO PURCHASE</span><h2 id="funnel-title">Where the warmth escapes.</h2><p>Unique daily visitors at each browser-tracked stage, ending with verified Paystack orders.</p></div>
        <div className={styles.funnel}>
          {funnel.map((stage, index) => <div className={styles.funnelRow} key={stage.label}>
            <div><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage.label}</strong><small>{stage.note}</small></div>
            <div className={styles.funnelTrack}><span style={{ width: `${data.current.visitors ? Math.max(4, Math.min(100, stage.value / data.current.visitors * 100)) : 0}%` }} /></div>
            <b>{formatNumber(stage.value)}</b>
          </div>)}
        </div>
      </section>
      <div className={styles.analyticsNotes}>
        <p><strong>How to read this:</strong> Paystack is the sales truth. Vercel events diagnose where shoppers drop off; browser blocking or a closed tab can make those stages undercount.</p>
        <p>Vercel’s privacy-friendly visitor identity resets daily, so a person returning on another day is counted again. Rates are most useful as consistent trends, not permanent person-level attribution.</p>
        <p><strong>Checkout signals this period:</strong> {formatNumber(data.current.paymentCancelled)} payment {data.current.paymentCancelled === 1 ? "cancellation" : "cancellations"} and {formatNumber(data.current.checkoutErrors)} checkout {data.current.checkoutErrors === 1 ? "error" : "errors"}. These browser events are diagnostic and may be blocked. Payment-stage tracking starts with this release, so use a range fully after deployment before treating its rates as a baseline.</p>
      </div>
    </>}
  </section>;
}
