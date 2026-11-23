import { parsePreorder, preorderTiming } from "../preorders";
import { batchReceived, purchaseNeedsReview, resolvePurchasePreorder, fulfilmentAllocationOverrides } from "../purchaseStore";
import { assertOrdersWritable, orderDatabase, orderStore, sqlOrders } from "../orderPersistence";
import { paystackEnvironment } from "../paystackEventConfig";
import { sanitizeAddress } from "../address";
import { sanitizeCart } from "../checkoutShared";
import type { OrderItem } from "../orderTypes";
import { publicReceipt } from "./receipts";
import { PRODUCT } from "../product";
import { AdminError, adminStore, digest } from "./store";
import type { AdminOrder, OrdersPage, ShippingReceipt } from "./types";
import { parseAttribution } from "../attribution";

export const orderReceiptKey = (reference: string) => `smelt:shipping:order:v1:${digest(reference)}`;
export const shipmentKey = (email: string, tracking: string) => `smelt:shipping:receipt:v1:${digest(`${email.toLowerCase()}\n${tracking}`)}`;
export const historyKey = (email: string) => `smelt:shipping:history:v1:${digest(email.toLowerCase())}`;
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function normalizeOrder(input: unknown): AdminOrder {
  const d = obj(input);
  let metadata = d.metadata;
  if (typeof metadata === "string") { try { metadata = JSON.parse(metadata); } catch { metadata = {}; } }
  const m = obj(metadata), customer = obj(d.customer);
  const cart = sanitizeCart(m.cart);
  const items: OrderItem[] = [];
  // Prefer the frozen descriptions/quantities, not today's product names.
  if (Array.isArray(m.items)) {
    for (const raw of m.items) {
      const item = obj(raw);
      if (typeof item.qty === "number" && Number.isSafeInteger(item.qty) && item.qty > 0 && item.qty <= 99)
        items.push({ colour: str(item.colour), name: str(item.name) || "Smelt sauna hat", qty: item.qty });
    }
  }
  if (!items.length) items.push(...(Object.keys(cart) as Array<keyof typeof cart>).filter(c => cart[c] > 0)
    .map(c => ({ colour: c, name: PRODUCT.variants[c].name, qty: cart[c] })));
  const email = str(customer.email).toLowerCase();
  const method = str(m.shippingMethod) || "aramex";
  let reviewReason: string | undefined;
  if (d.status !== "success" || typeof d.amount !== "number" || d.amount <= 0 || d.currency !== "ZAR") reviewReason = "Payment needs review.";
  else if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) reviewReason = "Customer email is missing or invalid.";
  else if (!items.length) reviewReason = "Order items are missing. Check the payment before shipping.";
  else if (method !== "aramex") reviewReason = "This order uses a different delivery method.";
  return {
    reference: str(d.reference), email, name: str(m.customerName) || [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" "),
    amount: typeof d.amount === "number" ? d.amount : 0, currency: str(d.currency), paidAt: str(d.paid_at) || null,
    preorder: parsePreorder(m.preorder),
    attribution: parseAttribution(m.attribution),
    items, address: sanitizeAddress(m.shippingAddress), shippingMethod: method,
    canShip: !reviewReason, reviewReason, receipt: null, history: [], completedAt: null, reviewMessageSentAt: null,
  };
}
async function paystack(path: string) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new AdminError("Order access has not been configured.", 503);
  const response = await fetch(`https://api.paystack.co${path}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (response.status === 404) throw new AdminError("No matching order was found.", 404);
  if (!response.ok || body.status !== true) throw new AdminError("Could not load orders from Paystack. Please try again.", 502);
  return body;
}
export async function getPaidOrder(reference: string) {
  if (!/^[a-zA-Z0-9_.=\-]{1,200}$/.test(reference)) throw new AdminError("Invalid order reference.");
  const sqlMode = orderStore() === "postgres";
  let observedAt: string | undefined;
  if (sqlMode) {
    assertOrdersWritable();
    const { paymentObservationTime } = await import("../db/payment-observations");
    observedAt = await paymentObservationTime(await orderDatabase());
  }
  const { data } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (sqlMode) {
    const { savePaymentObservation } = await import("../db/payment-observations");
    await savePaymentObservation(await orderDatabase(), paystackEnvironment(), reference, data, observedAt!);
    const stored = await (await sqlOrders()).find(reference);
    if (stored?.paymentReview !== "clear") throw new AdminError("This payment has a refund or dispute requiring review.", 409);
    if (stored.paymentStatus !== "success") throw new AdminError("This payment needs review.", 409);
  }
  if (data?.reference !== reference || data?.status !== "success") throw new AdminError("This order does not have a successful payment.", 409);
  const order = normalizeOrder(data);
  order.preorder = await resolvePurchasePreorder(order.reference, order.preorder, true);
  if (order.preorder && !await batchReceived(order.preorder.batch)) {
    order.canShip = false;
    order.reviewReason = `${preorderTiming(order.preorder)} Confirm the hats have been received in Restock requests before sending tracking.`;
  }
  await flagUnallocatedPayment(order);
  return order;
}

async function flagUnallocatedPayment(order: AdminOrder) {
  if (!order.completedAt && await purchaseNeedsReview(order.reference)) {
    order.canShip = false;
    order.reviewReason = 'Payment received but stock is not allocated. The reservation may have expired. Review stock or arrange a refund before shipping.';
  }
}

export async function findPaidOrdersByEmail(email: string): Promise<AdminOrder[]> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(normalized))
    throw new AdminError("Enter the email address used at checkout.");
  if (orderStore() === "postgres") {
    const rows = await (await sqlOrders()).byEmail(normalized);
    return rows.filter(row => row.paymentReview === "clear").map(sqlOrder);
  }
  const { data: customer } = await paystack(`/customer/${encodeURIComponent(normalized)}`);
  if (!Number.isSafeInteger(customer?.id)) throw new AdminError("No matching order was found.", 404);

  const orders: AdminOrder[] = [];
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ customer: String(customer.id), status: "success", perPage: "100", page: String(page) });
    const body = await paystack(`/transaction?${query}`);
    if (!Array.isArray(body.data) || !Number.isSafeInteger(body.meta?.pageCount))
      throw new AdminError("Order data could not be read. Please try again.", 502);
    orders.push(...body.data.map((value: unknown) => normalizeOrder(value)).filter((order: AdminOrder) => order.email === normalized));
    if (page >= body.meta.pageCount) break;
  }
  await Promise.all(orders.map(async order => { order.preorder = await resolvePurchasePreorder(order.reference, order.preorder, true); }));
  return orders.sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
}
export const completionKey = () => `smelt:orders:completed:v1:${process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"}`;
export const reviewMessageSentKey = () => `smelt:orders:review-message-sent:v1:${process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"}`;
export async function markReviewMessageSent(reference: string) {
  assertOrdersWritable();
  await getPaidOrder(reference);
  if (orderStore() === "postgres") return (await sqlOrders()).reviewMessage(reference);
  const db = adminStore();
  if (!await db.hget<string>(completionKey(), reference))
    throw new AdminError("Mark this order complete before recording a review message.", 409);
  // A manual confirmation records the first send; retries must not change its date.
  await db.hsetnx(reviewMessageSentKey(), reference, new Date().toISOString());
  const sentAt = await db.hget<string>(reviewMessageSentKey(), reference);
  if (!sentAt) throw new AdminError("Could not save the review message date. Please try again.", 503);
  return sentAt;
}
export async function setOrderCompleted(reference: string, completed: boolean) {
  assertOrdersWritable();
  await getPaidOrder(reference);
  if (orderStore() === "postgres") return (await sqlOrders()).complete(reference, completed);
  const db = adminStore();
  if (!completed) {
    await db.hdel(completionKey(), reference);
    return null;
  }
  const receipt = await db.get<ShippingReceipt>(orderReceiptKey(reference));
  if (receipt?.status !== "accepted") {
    throw new AdminError("Send the shipping email for this order before marking it complete.", 409);
  }
  // Repeated clicks retain the original completion timestamp. No email is sent here.
  const timestamp = new Date().toISOString();
  await db.hsetnx(completionKey(), reference, timestamp);
  return await db.hget<string>(completionKey(), reference);
}
// Both the dashboard and accounting export must read every provider page.
export async function listPaidTransactions(): Promise<unknown[]> {
  if (orderStore() === "postgres") return (await (await sqlOrders()).allPaid()).map(row => row.snapshot);
  const query = new URLSearchParams({ status: "success", perPage: "100", page: "1" });
  const transactions: unknown[] = [];
  let providerPage = 1;
  while (true) {
    query.set("page", String(providerPage));
    const body = await paystack(`/transaction?${query}`);
    if (!Array.isArray(body.data) || !Number.isSafeInteger(body.meta?.total) || body.meta.total < 0
      || !Number.isSafeInteger(body.meta?.pageCount) || body.meta.pageCount < 0
      || (!body.data.length && providerPage < body.meta.pageCount))
      throw new AdminError("Order data could not be read. Please try again.", 502);
    transactions.push(...body.data);
    if (providerPage >= body.meta.pageCount) break;
    providerPage++;
  }
  return transactions;
}
export async function listOrders(
  page: number,
  search = "",
  view: "active" | "completed" | "preorders" = "active",
  completedSort: "newest" | "oldest" = "newest",
): Promise<OrdersPage> {
  if (orderStore() === "postgres") return listSqlOrders(page, search, view, completedSort);
  let orders = (await listPaidTransactions()).map(normalizeOrder);
  // Search the same paid-order dataset as the dashboard. Provider verification
  // accepts exact references only and reports ordinary search misses as errors.
  const term = search.trim().toLowerCase();
  // Filter before allocation totals, completion filters, and dashboard pagination.
  if (term) orders = orders.filter(order =>
    [order.name, order.email, order.reference].some(value => value.toLowerCase().includes(term)));
  await Promise.all(orders.map(async order => { order.preorder = await resolvePurchasePreorder(order.reference, order.preorder, true); }));
  const db = adminStore();
  const [completed, reviewMessages] = await Promise.all([
    db.hgetall<Record<string, string>>(completionKey()),
    db.hgetall<Record<string, string>>(reviewMessageSentKey()),
  ]);
  for (const order of orders) {
    order.completedAt = completed?.[order.reference] || null;
    order.reviewMessageSentAt = reviewMessages?.[order.reference] || null;
  }
  const completedTotal = orders.filter(order => order.completedAt).length;
  const activeTotal = orders.length - completedTotal;
  // Count outstanding pre-order units across every page, using current allocations.
  const preorderToFulfil = { cream: 0, green: 0 };
  for (const order of orders) {
    if (order.completedAt || !order.preorder) continue;
    preorderToFulfil.cream += order.preorder.quantities.cream;
    preorderToFulfil.green += order.preorder.quantities.green;
  }
  const filtered = orders.filter(order => view === "completed" ? !!order.completedAt : !order.completedAt && (view !== "preorders" || !!order.preorder));
  if (view === "preorders") filtered.sort((a, b) => (a.paidAt || "").localeCompare(b.paidAt || "") || a.reference.localeCompare(b.reference));
  if (view === "completed") filtered.sort((a, b) => completedSort === "oldest"
    ? a.completedAt!.localeCompare(b.completedAt!)
    : b.completedAt!.localeCompare(a.completedAt!));
  const pageCount = Math.ceil(filtered.length / 25);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const result: OrdersPage = { orders: filtered.slice((currentPage - 1) * 25, currentPage * 25), page: currentPage, pageCount, total: filtered.length, activeTotal, completedTotal, preorderToFulfil };
  for (const batch of new Set(result.orders.flatMap(order => order.preorder ? [order.preorder.batch] : []))) {
    if (!await batchReceived(batch)) for (const order of result.orders) if (order.preorder?.batch === batch) {
      order.canShip = false;
      order.reviewReason = `${preorderTiming(order.preorder)} Confirm the hats have been received in Restock requests before sending tracking.`;
    }
  }
  await Promise.all(result.orders.map(flagUnallocatedPayment));
  const pipeline = db.pipeline();
  if (!result.orders.length) return result;
  for (const order of result.orders) { pipeline.get(orderReceiptKey(order.reference)); pipeline.hgetall(historyKey(order.email)); }
  const records = await pipeline.exec();
  result.orders.forEach((order, i) => {
    const receipt = records[i * 2] as ShippingReceipt | null;
    order.receipt = receipt ? publicReceipt(receipt) : null;
    const history = records[i * 2 + 1] as Record<string, ShippingReceipt> | null;
    order.history = Object.values(history || {}).filter(r => r.reference !== order.reference && !(r.id && r.id === order.receipt?.id)).map(publicReceipt).sort((a, b) => b.startedAt - a.startedAt);
  });
  return result;
}

function sqlOrder(row: typeof import("../db/schema").orders.$inferSelect): AdminOrder {
  const order = normalizeOrder({ ...row.snapshot, status: row.paymentStatus, amount: row.amountMinor, currency: row.currency });
  order.completedAt = row.completedAt ? new Date(row.completedAt).toISOString() : null;
  order.reviewMessageSentAt = row.reviewMessageSentAt ? new Date(row.reviewMessageSentAt).toISOString() : null;
  if (row.paymentReview !== "clear") { order.canShip = false; order.reviewReason = "This payment has a refund or dispute requiring review."; }
  return order;
}
async function listSqlOrders(page: number, search: string, view: "active" | "completed" | "preorders", sort: "newest" | "oldest"): Promise<OrdersPage> {
  const domain = await sqlOrders();
  const { rows, ...pagination } = await domain.page(page, search, view, sort, await fulfilmentAllocationOverrides());
  const orders = await Promise.all(rows.map(async row => {
    const order = sqlOrder(row);
    order.preorder = row.preorder && row.effectiveGreen + row.effectiveCream > 0
      ? { ...row.preorder, quantities: { green: row.effectiveGreen, cream: row.effectiveCream } } : undefined;
    if (order.preorder && !await batchReceived(order.preorder.batch)) {
      order.canShip = false; order.reviewReason = `${preorderTiming(order.preorder)} Confirm the hats have been received in Restock requests before sending tracking.`;
    }
    await flagUnallocatedPayment(order);
    const [receipt, history] = await Promise.all([domain.shipment(order.reference), domain.history(order.email)]);
    order.receipt = receipt ? publicReceipt(receipt) : null;
    order.history = history.filter(r => r.reference !== order.reference && !(r.id && r.id === receipt?.id)).map(publicReceipt);
    return order;
  }));
  return { ...pagination, orders };
}
