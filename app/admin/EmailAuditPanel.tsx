"use client";
import { useCallback, useEffect, useState } from "react";
import type { EmailAuditReport, EmailIssue, ReceiptState } from "@/lib/admin/emailAudit";
import { formatMoney } from "@/lib/pricing";
import styles from "./admin.module.css";

const LABELS: Record<ReceiptState, string> = {
  accepted: "Sent",
  pending: "Not confirmed by Resend",
  missing: "Not sent",
};
function when(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Johannesburg",
      }).format(new Date(value))
    : "Unknown";
}
function hats(issue: EmailIssue) {
  return (
    [issue.green && `${issue.green} green`, issue.cream && `${issue.cream} cream`]
      .filter(Boolean)
      .join(" · ") || "No hats recorded"
  );
}

export default function EmailAuditPanel({
  onExpired,
  onCount,
}: {
  onExpired: () => void;
  onCount: (count: number) => void;
}) {
  const [report, setReport] = useState<EmailAuditReport | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useCallback(
    async (init?: RequestInit) => {
      const response = await fetch("/api/admin/email-audit", {
        ...init,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      if (response.status === 401) {
        onExpired();
        throw new Error("Please sign in again.");
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load the email audit.");
      const next = result.report as EmailAuditReport | null;
      setReport(next);
      onCount(next?.issues.length ?? 0);
    },
    [onExpired, onCount],
  );
  const run = useCallback(
    async (init?: RequestInit) => {
      setBusy(true);
      setError("");
      try {
        await request(init);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load the email audit.");
      } finally {
        setBusy(false);
      }
    },
    [request],
  );
  useEffect(() => {
    queueMicrotask(() => void run());
  }, [run]);

  return (
    <section aria-label="Order email issues" aria-busy={busy}>
      <div className={styles.conversationToolbar}>
        <p className={styles.help}>
          Checks every paid order once a day (08:00) for a customer confirmation and an owner
          notification accepted by Resend. Orders from the last 2 hours are checked on the next run.
          Nothing is sent from here.
          {report && (
            <>
              {" "}
              Last checked {when(report.ranAt)} · {report.checked} paid orders.
            </>
          )}
        </p>
        <button
          className={styles.refresh}
          disabled={busy}
          onClick={() => void run({ method: "POST", body: JSON.stringify({ action: "run" }) })}
        >
          {busy ? "Checking…" : "Check now ↻"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {report === undefined ? (
        !error && <p role="status">Loading email audit…</p>
      ) : report === null ? (
        <div className={styles.empty}>
          <h2>Not checked yet</h2>
          <p>The first daily check runs at 08:00, or use Check now.</p>
        </div>
      ) : !report.issues.length ? (
        <div className={styles.empty}>
          <h2>All emails sent</h2>
          <p>Every paid order has an accepted confirmation and owner notification.</p>
        </div>
      ) : (
        <div className={styles.couponList}>
          {report.issues.map((issue) => (
            <article key={issue.reference} className={`${styles.couponCard} ${styles.emailIssue}`}>
              <div>
                <strong>{issue.name || issue.email || "Customer details unavailable"}</strong>
                {issue.email ? (
                  <a href={`mailto:${issue.email}`} className={styles.email}>
                    {issue.email}
                  </a>
                ) : (
                  <span className={styles.note}>
                    Paystack lookup failed. Search the reference in Paystack.
                  </span>
                )}
                <span className={styles.reference}>{issue.reference}</span>
                <span className={styles.date}>
                  Paid {when(issue.paidAt ?? issue.createdAt)} · {hats(issue)}
                  {issue.amount !== undefined && ` · ${formatMoney(issue.amount / 100)}`}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Customer confirmation</dt>
                  <dd>{LABELS[issue.customer]}</dd>
                </div>
                <div>
                  <dt>Owner notification</dt>
                  <dd>{issue.owner ? LABELS[issue.owner] : "Not applicable"}</dd>
                </div>
              </dl>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() =>
                  void run({
                    method: "PATCH",
                    body: JSON.stringify({ reference: issue.reference }),
                  })
                }
                aria-label={`Mark ${issue.reference} as handled`}
              >
                Mark as handled
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
