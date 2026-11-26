// Daily audit of order notification emails. Read-only towards orders and
// email receipts: it never sends, retries or edits an email. It stores one
// snapshot of the latest run and a set of references the team marked handled.
//
// Source of paid orders: the purchase ledger (lib/inventory/purchaseStore.ts), which holds
// every `smeltp-` checkout. Receipt keys mirror lib/orderConfirmation.ts.
import { adminStore, AdminError, digest } from "./store";
import { stockScope } from "../inventory/stockEnvironment";
import { verifyTransaction } from "../payments/paystack";

export type ReceiptState = "accepted" | "pending" | "missing";
export interface EmailIssue {
  reference: string;
  createdAt: string;
  green: number;
  cream: number;
  customer: ReceiptState;
  /** null when the order predates owner notifications. */
  owner: ReceiptState | null;
  // Best-effort Paystack details; absent when the lookup failed.
  email?: string;
  name?: string;
  amount?: number;
  paidAt?: string | null;
}
export interface EmailAuditReport {
  ranAt: string;
  checked: number;
  issues: EmailIssue[];
}

// Owner "new order" emails started with commit 26112bd; earlier orders never had one.
export const OWNER_EMAILS_SINCE = "2026-09-26T06:11:17.000Z";
// Orders this recent may still have a confirmation in flight (the stock cleanup
// sends one about an hour after checkout), so they are left for the next run.
export const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000;
const MAX_LOOKUPS = 25;

const prefix = () => `smelt:email-audit:v1:${stockScope()}`;
const reportKey = () => `${prefix()}:latest`;
const handledKey = () => `${prefix()}:handled`;
const REFERENCE = /^smeltp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Allocation = { status?: string; createdAt?: string; green?: number; cream?: number };
const state = (receipt: { status?: string } | null | undefined): ReceiptState =>
  receipt?.status === "accepted"
    ? "accepted"
    : receipt?.status === "pending"
      ? "pending"
      : "missing";

export async function runEmailAudit(now = Date.now()): Promise<EmailAuditReport> {
  const db = adminStore();
  const ledger =
    (await db.hgetall<Record<string, Allocation>>(`smelt:preorders:v1:${stockScope()}:orders`)) ??
    {};
  const cutoff = now - GRACE_PERIOD_MS;
  const paid = Object.entries(ledger)
    .filter(([, order]) => order.status === "paid" && Date.parse(order.createdAt ?? "") <= cutoff)
    .sort(([, a], [, b]) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  const issues: EmailIssue[] = [];
  for (let i = 0; i < paid.length; i += 50) {
    const batch = paid.slice(i, i + 50);
    const keys = batch.flatMap(([reference]) => {
      const hash = digest(reference);
      return [`smelt:order-confirmation:v1:${hash}`, `smelt:owner-order:v1:${hash}`];
    });
    const receipts = await db.mget<({ status?: string } | null)[]>(...keys);
    batch.forEach(([reference, order], index) => {
      const customer = state(receipts[index * 2]);
      const createdAt = order.createdAt ?? "";
      const owner = createdAt >= OWNER_EMAILS_SINCE ? state(receipts[index * 2 + 1]) : null;
      if (customer !== "accepted" || (owner !== null && owner !== "accepted")) {
        issues.push({
          reference,
          createdAt,
          green: order.green ?? 0,
          cream: order.cream ?? 0,
          customer,
          owner,
        });
      }
    });
  }

  // Customer details live only in Paystack. Look up flagged orders only; a
  // failed lookup still reports the issue, just without contact details.
  await Promise.all(
    issues.slice(0, MAX_LOOKUPS).map(async (issue) => {
      try {
        const payment = await verifyTransaction(issue.reference);
        if (payment.reference !== issue.reference) return;
        const name = payment.metadata?.customerName;
        Object.assign(issue, {
          email: payment.customerEmail ?? undefined,
          amount: payment.amount,
          paidAt: payment.paidAt,
          ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 120) } : {}),
        });
      } catch {
        console.error("Email audit Paystack lookup failed", issue.reference);
      }
    }),
  );

  const report: EmailAuditReport = {
    ranAt: new Date(now).toISOString(),
    checked: paid.length,
    issues,
  };
  await db.set(reportKey(), report);
  if (issues.length)
    console.warn(
      "Email audit found orders without accepted notifications",
      issues.map((issue) => issue.reference),
    );
  return report;
}

/** Latest snapshot without issues the team has marked handled, or null before the first run. */
export async function getEmailAudit(): Promise<EmailAuditReport | null> {
  const db = adminStore();
  const [report, handled] = await Promise.all([
    db.get<EmailAuditReport>(reportKey()),
    db.hgetall<Record<string, string>>(handledKey()),
  ]);
  if (!report) return null;
  return { ...report, issues: report.issues.filter((issue) => !handled?.[issue.reference]) };
}

/** Idempotent: the first handled time is kept if this is repeated. */
export async function markEmailIssueHandled(reference: unknown): Promise<void> {
  if (typeof reference !== "string" || !REFERENCE.test(reference))
    throw new AdminError("Invalid order reference.");
  await adminStore().hsetnx(handledKey(), reference, new Date().toISOString());
}
