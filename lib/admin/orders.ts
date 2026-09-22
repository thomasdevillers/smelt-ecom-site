import { parsePreorder } from "../preorders";
import { batchReceived } from "../preorderStore";
import { sanitizeAddress } from "../address";
import { sanitizeCart } from "../checkoutShared";
import type { OrderItem } from "../orderTypes";
import { publicReceipt } from "./receipts";
import { PRODUCT } from "../product";
import { AdminError, adminStore, digest } from "./store";
import type { AdminOrder, OrdersPage, ShippingReceipt } from "./types";

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
  const items: OrderItem[] = (Object.keys(cart) as Array<keyof typeof cart>).filter(c => cart[c] > 0)
    .map(c => ({ colour: c, name: PRODUCT.variants[c].name, qty: cart[c] }));
  // Older transactions may store items without a cart. Preserve their historical quantities.
  if (!items.length && Array.isArray(m.items)) {
    for (const raw of m.items) {
      const item = obj(raw);
      if (typeof item.qty === "number" && Number.isSafeInteger(item.qty) && item.qty > 0 && item.qty <= 99)
        items.push({ colour: str(item.colour), name: str(item.name) || "Smelt sauna hat", qty: item.qty });
    }
  }
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
    items, address: sanitizeAddress(m.shippingAddress), shippingMethod: method,
    canShip: !reviewReason, reviewReason, receipt: null, history: [], completedAt: null,
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
  const { data } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (data?.reference !== reference || data?.status !== "success") throw new AdminError("This order does not have a successful payment.", 409);
  const order = normalizeOrder(data);
  if (order.preorder && !await batchReceived(order.preorder.batch)) {
    order.canShip = false;
    order.reviewReason = 'Pre-order awaiting the incoming batch. Receive the shipment in Restock requests before sending tracking.';
  }
  return order;
}

export async function findPaidOrdersByEmail(email: string): Promise<AdminOrder[]> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(normalized))
    throw new AdminError("Enter the email address used at checkout.");
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
  return orders.sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
}
export const completionKey = () => `smelt:orders:completed:v1:${process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"}`;
export async function setOrderCompleted(reference: string, completed: boolean, confirmPriorShipment = false) {
  const order = await getPaidOrder(reference);
  const db = adminStore();
  if (!completed) {
    await db.hdel(completionKey(), reference);
    return null;
  }
  const receipt = await db.get<ShippingReceipt>(orderReceiptKey(reference));
  if (receipt?.status !== "accepted") {
    if (!confirmPriorShipment) throw new AdminError("Send the shipping email or confirm an accepted previous shipment before marking this order complete.", 409);
    const history = await db.hgetall<Record<string, ShippingReceipt>>(historyKey(order.email)) || {};
    const acceptedHistory = Object.values(history).some(previous => previous.status === "accepted" && previous.reference !== reference);
    if (!acceptedHistory) throw new AdminError("No accepted previous shipping email was found for this customer.", 409);
  }
  // Repeated clicks retain the original completion timestamp. No email is sent here.
  const timestamp = new Date().toISOString();
  await db.hsetnx(completionKey(), reference, timestamp);
  return await db.hget<string>(completionKey(), reference);
}
export async function listOrders(
  page: number,
  search = "",
  view: "active" | "completed" | "preorders" = "active",
  completedSort: "newest" | "oldest" = "newest",
): Promise<OrdersPage> {
  const query = new URLSearchParams({ status: "success", perPage: "100", page: "1" });
  let orders: AdminOrder[] = [];
  if (search && !search.includes("@")) {
    orders = [await getPaidOrder(search)];
  } else {
    if (search) {
      try {
        const { data } = await paystack(`/customer/${encodeURIComponent(search.toLowerCase())}`);
        if (!Number.isSafeInteger(data?.id)) throw new AdminError("Could not find this customer.", 404);
        query.set("customer", String(data.id));
      } catch (error) {
        if (error instanceof AdminError && error.status === 404) return { orders: [], page: 1, pageCount: 0, total: 0, activeTotal: 0, completedTotal: 0 };
        throw error;
      }
    }
    // Filter BEFORE dashboard pagination, so completed orders never leave gaps or hide older active orders.
    let providerPage = 1;
    while (true) {
      query.set("page", String(providerPage));
      const body = await paystack(`/transaction?${query}`);
      if (!Array.isArray(body.data) || !Number.isSafeInteger(body.meta?.total) || !Number.isSafeInteger(body.meta?.pageCount))
        throw new AdminError("Order data could not be read. Please try again.", 502);
      orders.push(...body.data.map(normalizeOrder));
      if (providerPage >= body.meta.pageCount) break;
      providerPage++;
    }
  }
  const db = adminStore();
  const completed = await db.hgetall<Record<string, string>>(completionKey()) || {};
  for (const order of orders) order.completedAt = completed[order.reference] || null;
  const completedTotal = orders.filter(order => order.completedAt).length;
  const activeTotal = orders.length - completedTotal;
  const filtered = orders.filter(order => view === "completed" ? !!order.completedAt : !order.completedAt && (view !== "preorders" || !!order.preorder));
  if (view === "preorders") filtered.sort((a, b) => (a.paidAt || "").localeCompare(b.paidAt || "") || a.reference.localeCompare(b.reference));
  if (view === "completed") filtered.sort((a, b) => completedSort === "oldest"
    ? a.completedAt!.localeCompare(b.completedAt!)
    : b.completedAt!.localeCompare(a.completedAt!));
  const pageCount = Math.ceil(filtered.length / 25);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const result: OrdersPage = { orders: filtered.slice((currentPage - 1) * 25, currentPage * 25), page: currentPage, pageCount, total: filtered.length, activeTotal, completedTotal };
  for (const batch of new Set(result.orders.flatMap(order => order.preorder ? [order.preorder.batch] : []))) {
    if (!await batchReceived(batch)) for (const order of result.orders) if (order.preorder?.batch === batch) {
      order.canShip = false;
      order.reviewReason = 'Pre-order awaiting the incoming batch. Receive the shipment in Restock requests before sending tracking.';
    }
  }
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
