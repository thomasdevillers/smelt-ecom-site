/** Offline Phase 5 planner. No runtime stores, providers, prices or email imports. */
import { sha256, type Snapshot } from "./baseline";
import { canonical } from "./review-custom-plan";

export type Mode = "live" | "test";
type ObjectValue = Record<string, unknown>;
export interface PaystackCapture {
  version: 1;
  environment: Mode;
  startedAt: string;
  completedAt: string;
  total: number;
  transactions: unknown[];
}
export interface OrderImport {
  reference: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  paymentStatus: "pending" | "success" | "failed" | "reversed";
  createdAt: string;
  paidAt: string | null;
  observedAt: string;
  completedAt: string | null;
  reviewMessageSentAt: string | null;
  snapshot: ObjectValue;
  items: {
    position: number;
    quantity: number;
    unitPriceMinor: number | null;
    currency: string;
    snapshot: ObjectValue;
  }[];
}
export interface ShipmentImport {
  id: string;
  orderReference: string | null;
  email: string;
  trackingNumber: string;
  status: "pending" | "accepted";
  startedAt: string;
  payload: ObjectValue;
  sources: { sourceKey: string; sourceField: string }[];
}
export interface OrderPlan {
  version: 1;
  environment: Mode;
  archiveChecksum: string;
  providerChecksum: string;
  orders: OrderImport[];
  shipments: ShipmentImport[];
  rejected: { source: string; reason: string }[];
  sources: { key: string; decision: "mapped" | "other-environment" | "quarantined" }[];
  digest: string;
}
function object(value: unknown): ObjectValue {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("invalid-json");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-object");
  return value as ObjectValue;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("missing-string");
  return value;
}
function date(value: unknown): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(Date.parse(raw)))
    throw new Error("invalid-timestamp");
  return new Date(raw).toISOString();
}
function reference(value: unknown): string {
  const result = text(value);
  if (!/^[a-zA-Z0-9_.=\-]{1,200}$/.test(result)) throw new Error("invalid-reference");
  return result;
}
function money(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647)
    throw new Error("invalid-money");
  return Number(value);
}
function pairs(row: Snapshot): [string, unknown][] {
  if (row.type !== "hash" || !Array.isArray(row.logical)) throw new Error("invalid-hash");
  const seen = new Set<string>();
  return row.logical.map((pair) => {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      seen.has(pair[0])
    )
      throw new Error("invalid-hash-field");
    seen.add(pair[0]);
    return [pair[0], pair[1]];
  });
}
function transaction(raw: unknown, capture: PaystackCapture): OrderImport {
  const d = object(raw);
  if (d.domain !== capture.environment) throw new Error("provider-environment-mismatch");
  if (!Number.isSafeInteger(d.id) || Number(d.id) <= 0) throw new Error("invalid-provider-id");
  const statuses: Record<string, OrderImport["paymentStatus"]> = {
    success: "success",
    failed: "failed",
    abandoned: "failed",
    reversed: "reversed",
    pending: "pending",
    ongoing: "pending",
    processing: "pending",
    queued: "pending",
  };
  const status = text(d.status);
  if (!Object.hasOwn(statuses, status)) throw new Error("unknown-payment-status");
  const currency = text(d.currency);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("invalid-currency");
  const items: OrderImport["items"] = [];
  const m =
    d.metadata === null || d.metadata === undefined || d.metadata === "" ? {} : object(d.metadata);
  // The application records metadata.unitPrice in whole Rand. Never fill a
  // missing historical price from PRODUCT or spread the transaction total.
  let unitPriceMinor: number | null = null;
  if (m.unitPrice !== undefined) {
    if (typeof m.unitPrice !== "number") throw new Error("invalid-unit-price");
    unitPriceMinor = money(m.unitPrice * 100);
  }
  if (Array.isArray(m.items) && m.items.length) {
    for (const rawItem of m.items) {
      const item = object(rawItem);
      if (!Number.isSafeInteger(item.qty) || Number(item.qty) <= 0 || Number(item.qty) > 2147483647)
        throw new Error("invalid-item-quantity");
      items.push({
        position: items.length,
        quantity: Number(item.qty),
        unitPriceMinor,
        currency,
        snapshot: item,
      });
    }
  } else if (m.cart !== undefined) {
    for (const [colour, qty] of Object.entries(object(m.cart)).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!Number.isSafeInteger(qty) || Number(qty) < 0 || Number(qty) > 2147483647)
        throw new Error("invalid-cart-quantity");
      if (qty)
        items.push({
          position: items.length,
          quantity: Number(qty),
          unitPriceMinor,
          currency,
          snapshot: { colour, qty },
        });
    }
  }
  return {
    reference: reference(d.reference),
    providerId: String(d.id),
    amountMinor: money(d.amount),
    currency,
    paymentStatus: statuses[status],
    createdAt: date(d.created_at),
    paidAt: d.paid_at ? date(d.paid_at) : null,
    observedAt: date(capture.completedAt),
    completedAt: null,
    reviewMessageSentAt: null,
    snapshot: d,
    items,
  };
}

/** Shipping ownership is an explicit per-source-key decision, never guessed from
 * the Paystack key, an email match, a reference prefix or the selected capture. */
export function planOrders(
  capture: PaystackCapture,
  snapshots: Snapshot[],
  archiveChecksum: string,
  shippingOwnership: Record<string, Mode> = {},
  localReceipts: { path: string; content: string; checksum: string }[] = [],
): OrderPlan {
  if (
    capture.version !== 1 ||
    !["live", "test"].includes(capture.environment) ||
    !Array.isArray(capture.transactions) ||
    !Number.isSafeInteger(capture.total) ||
    capture.total !== capture.transactions.length ||
    Date.parse(date(capture.startedAt)) > Date.parse(date(capture.completedAt))
  )
    throw new Error("Invalid provider capture.");
  const plan: OrderPlan = {
    version: 1,
    environment: capture.environment,
    archiveChecksum,
    providerChecksum: sha256(canonical(capture)),
    orders: [],
    shipments: [],
    sources: [],
    rejected: [],
    digest: "",
  };
  const orders = new Map<string, OrderImport>(),
    providerIds = new Set<string>(),
    shipments = new Map<string, ShipmentImport>();
  const reject = (source: string, error: unknown) =>
    plan.rejected.push({
      source,
      reason: error instanceof Error ? error.message : "invalid-record",
    });
  for (const [index, raw] of capture.transactions.entries()) {
    try {
      const order = transaction(raw, capture);
      if (orders.has(order.reference) || providerIds.has(order.providerId))
        throw new Error("duplicate-provider-transaction");
      orders.set(order.reference, order);
      providerIds.add(order.providerId);
    } catch (error) {
      reject(`paystack:${index}`, error);
    }
  }
  const seenKeys = new Set<string>();
  for (const row of snapshots) {
    try {
      if (seenKeys.has(row.key)) throw new Error("duplicate-source-key");
      seenKeys.add(row.key);
      if (row.unstable || row.expiresAt !== null)
        throw new Error("unstable-or-expiring-durable-record");
      const dates = /^smelt:orders:(completed|review-message-sent):v1:(live|test)$/.exec(row.key);
      if (dates) {
        if (dates[2] !== capture.environment) {
          plan.sources.push({ key: row.key, decision: "other-environment" });
          continue;
        }
        for (const [ref, raw] of pairs(row)) {
          const order = orders.get(reference(ref));
          if (!order) throw new Error("fulfilment-order-not-in-provider-capture");
          let value = raw;
          if (typeof value === "string" && value.startsWith('"')) value = JSON.parse(value);
          order[dates[1] === "completed" ? "completedAt" : "reviewMessageSentAt"] = date(value);
        }
      } else if (/^smelt:shipping:(order|receipt|history):v1:[a-f0-9]{64}$/.test(row.key)) {
        const owner = shippingOwnership[row.key];
        if (owner !== "live" && owner !== "test")
          throw new Error("shipping-environment-needs-explicit-resolution");
        if (owner !== capture.environment) {
          plan.sources.push({ key: row.key, decision: "other-environment" });
          continue;
        }
        const history = row.key.startsWith("smelt:shipping:history:");
        if (!history && row.type !== "string") throw new Error("invalid-shipping-type");
        const values: [string, unknown][] = history ? pairs(row) : [["", row.logical]];
        for (const [field, raw] of values) {
          const payload = { ...object(raw) },
            email = text(payload.email).toLowerCase(),
            trackingNumber = text(payload.trackingNumber);
          if (
            !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ||
            !/^\d{6,30}$/.test(trackingNumber)
          )
            throw new Error("invalid-shipment-identity");
          if (
            !["pending", "accepted"].includes(String(payload.status)) ||
            !["manual", "dashboard"].includes(String(payload.source)) ||
            !Number.isSafeInteger(payload.startedAt) ||
            Number(payload.startedAt) <= 0
          )
            throw new Error("invalid-shipment-state");
          if (payload.status === "accepted") {
            text(payload.id);
            date(payload.acceptedAt);
          }
          const id = sha256(`${email}\n${trackingNumber}`);
          const ref = payload.reference === undefined ? null : reference(payload.reference);
          if (ref && !orders.has(ref)) throw new Error("shipment-order-not-in-provider-capture");
          // An accepted manual receipt may have been aliased to an order later.
          // Match the exact hashed provider reference; retain the original payload.
          const knownOrder =
            row.key.startsWith("smelt:shipping:order:") &&
            [...orders.keys()].find((reference) => row.key.endsWith(`:${sha256(reference)}`));
          const expected = history
            ? sha256(email)
            : row.key.startsWith("smelt:shipping:order:")
              ? knownOrder && sha256(knownOrder)
              : id;
          if (!expected || !row.key.endsWith(`:${expected}`) || (history && field !== id))
            throw new Error("shipment-source-identity-mismatch");
          const existing = shipments.get(id);
          // Even a pending/accepted mismatch needs reconciliation, not a guessed winner.
          if (existing && canonical(existing.payload) !== canonical(payload))
            throw new Error("shipping-alias-payload-conflict");
          const shipment: ShipmentImport = existing ?? {
            id,
            orderReference: ref,
            email,
            trackingNumber,
            status: payload.status as "pending" | "accepted",
            startedAt: new Date(Number(payload.startedAt)).toISOString(),
            payload,
            sources: [],
          };
          shipment.sources.push({ sourceKey: row.key, sourceField: field });
          shipments.set(id, shipment);
        }
      } else throw new Error("unknown-order-shipping-source");
      plan.sources.push({ key: row.key, decision: "mapped" });
    } catch (error) {
      reject(row.key, error);
      plan.sources.push({ key: row.key, decision: "quarantined" });
    }
  }
  for (const local of [...localReceipts].sort((a, b) => a.path.localeCompare(b.path))) {
    try {
      if (
        !local.path.startsWith(".local/shipping/receipts/") ||
        sha256(local.content) !== local.checksum ||
        seenKeys.has(local.path)
      )
        throw new Error("invalid-local-shipping-evidence");
      seenKeys.add(local.path);
      const owner = shippingOwnership[local.path];
      if (owner !== "live" && owner !== "test")
        throw new Error("shipping-environment-needs-explicit-resolution");
      if (owner !== capture.environment) {
        plan.sources.push({ key: local.path, decision: "other-environment" });
        continue;
      }
      const raw = object(local.content),
        email = text(raw.email).toLowerCase(),
        trackingNumber = text(raw.trackingNumber);
      if (
        !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ||
        !/^\d{6,30}$/.test(trackingNumber) ||
        !["pending", "accepted"].includes(String(raw.status))
      )
        throw new Error("invalid-local-shipping-receipt");
      const id = sha256(`${email}\n${trackingNumber}`),
        existing = shipments.get(id);
      const startedAt = date(raw.attemptedAt ?? raw.acceptedAt);
      if (raw.status === "accepted") {
        text(raw.id);
        date(raw.acceptedAt);
      }
      if (
        existing &&
        (existing.status !== raw.status ||
          (raw.status === "accepted" && existing.payload.id !== raw.id))
      )
        throw new Error("local-shared-shipping-conflict");
      const payload = existing?.payload ?? {
        status: raw.status,
        email,
        trackingNumber,
        source: "manual",
        startedAt: Date.parse(startedAt),
        ...(raw.status === "accepted" ? { id: raw.id, acceptedAt: raw.acceptedAt } : {}),
      };
      const evidence = Array.isArray(payload.localEvidence) ? payload.localEvidence : [];
      payload.localEvidence = [
        ...evidence,
        { path: local.path, checksum: local.checksum, record: raw },
      ];
      const shipment: ShipmentImport = existing ?? {
        id,
        email,
        trackingNumber,
        status: raw.status as "accepted" | "pending",
        orderReference: null,
        startedAt,
        payload,
        sources: [],
      };
      shipment.sources.push({ sourceKey: local.path, sourceField: local.checksum });
      shipments.set(id, shipment);
      plan.sources.push({ key: local.path, decision: "mapped" });
    } catch (error) {
      reject(local.path, error);
      plan.sources.push({ key: local.path, decision: "quarantined" });
    }
  }
  const shipmentOrders = new Set<string>();
  for (const shipment of shipments.values()) {
    if (shipment.orderReference && shipmentOrders.has(shipment.orderReference))
      reject(shipment.id, new Error("multiple-shipments-for-order"));
    if (shipment.orderReference) shipmentOrders.add(shipment.orderReference);
    shipment.sources.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  }
  plan.orders = [...orders.values()].sort((a, b) => a.reference.localeCompare(b.reference));
  plan.shipments = [...shipments.values()].sort((a, b) => a.id.localeCompare(b.id));
  plan.sources.sort((a, b) => a.key.localeCompare(b.key));
  plan.digest = sha256(canonical({ ...plan, digest: undefined }));
  return plan;
}
