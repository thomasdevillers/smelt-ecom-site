import { publicReceipt } from "./receipts";
import { Resend } from "resend";
import { shippingEmail } from "../emails/shipping";
import { AdminError, adminStore, digest } from "./store";
import { getPaidOrder, historyKey, orderReceiptKey, shipmentKey } from "./orders";
import type { ShippingReceipt } from "./types";

type PendingReceipt = ShippingReceipt & { message?: { from: string; to: string; subject: string; html: string; text: string } };
// Reserve both the order and email/waybill pair atomically. Neither reservation expires.
export const RESERVE_SHIPMENT = `
local order = redis.call('GET', KEYS[1])
if order then return order end
local shipment = redis.call('GET', KEYS[2])
if shipment then
  local existing = cjson.decode(shipment)
  if existing.status == 'accepted' then redis.call('SET', KEYS[1], shipment) end
  return shipment
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
return ARGV[1]`;
export const ACCEPT_SHIPMENT = `
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
redis.call('HSET', KEYS[3], ARGV[2], ARGV[1])
return 1`;
export async function sendShipping(reference: string, input: unknown): Promise<ShippingReceipt> {
  const tracking = typeof input === "string" ? input.trim() : "";
  if (!/^\d{6,30}$/.test(tracking)) throw new AdminError("Enter a valid waybill number (6–30 digits).");
  const order = await getPaidOrder(reference);
  if (!order.canShip) throw new AdminError(order.reviewReason || "This order needs review.", 409);
  const from = process.env.ORDER_FROM_EMAIL, key = process.env.RESEND_API_KEY;
  if (!from || !key || from.includes("@resend.dev")) throw new AdminError("Shipping email is not configured.", 503);
  const db = adminStore();
  const orderKey = orderReceiptKey(reference);
  const pairKey = shipmentKey(order.email, tracking);
  const proposed: PendingReceipt = {
    status: "pending", trackingNumber: tracking, email: order.email, reference, startedAt: Date.now(), source: "dashboard",
    // Use exactly the same email template and greeting as the manual script.
    message: { from, to: order.email, ...shippingEmail({ trackingNumber: tracking }) },
  };
  const receipt = await db.eval<unknown[], PendingReceipt>(RESERVE_SHIPMENT, [orderKey, pairKey], [JSON.stringify(proposed)]);
  if (receipt.trackingNumber !== tracking) throw new AdminError("A different waybill is already recorded for this order. Refresh to see it.", 409);
  if (receipt.status === "accepted") return publicReceipt(receipt);
  if (receipt.reference !== reference || !receipt.message || !Number.isFinite(receipt.startedAt) || Date.now() - receipt.startedAt >= 23 * 60 * 60 * 1000)
    throw new AdminError("This send needs manual review. Check Resend before trying to send another email.", 409);
  const hash = digest(`${order.email.toLowerCase()}\n${tracking}`);
  const result = await new Resend(key).emails.send(receipt.message, { idempotencyKey: `shipping-${hash}` });
  if (result.error || !result.data?.id) throw new AdminError("Email acceptance is unconfirmed. Retry this same waybill to safely check the send, or check Resend.", 502);
  const accepted: ShippingReceipt = { ...publicReceipt(receipt), status: "accepted", id: result.data.id, acceptedAt: new Date().toISOString() };
  await db.eval(ACCEPT_SHIPMENT, [orderKey, pairKey, historyKey(order.email)], [JSON.stringify(accepted), hash]);
  return accepted;
}
export async function shippingStatus(reference: string): Promise<ShippingReceipt | null> {
  if (!/^[a-zA-Z0-9_.=\-]{1,200}$/.test(reference)) throw new AdminError("Invalid order reference.");
  const db = adminStore();
  const receipt = await db.get<PendingReceipt>(orderReceiptKey(reference));
  if (!receipt) return null;
  if (receipt.status !== "accepted" || !receipt.id) return publicReceipt(receipt);
  const result = await new Resend(process.env.RESEND_API_KEY).emails.get(receipt.id);
  if (result.error || !result.data) throw new AdminError("Could not refresh delivery status. The email remains recorded as accepted.", 502);
  if (!result.data.to.some(email => email.toLowerCase() === receipt.email.toLowerCase())) throw new AdminError("The email receipt needs manual review.", 409);
  const updated = { ...publicReceipt(receipt), lastEvent: result.data.last_event };
  await db.eval(ACCEPT_SHIPMENT, [orderReceiptKey(reference), shipmentKey(receipt.email, receipt.trackingNumber), historyKey(receipt.email)],
    [JSON.stringify(updated), digest(`${receipt.email.toLowerCase()}\n${receipt.trackingNumber}`)]);
  return updated;
}

/** Shared receipts for future CLI sends, so CLI and dashboard cannot resend the same shipment. */
export async function sendManualShipping(shipment: { email: string; trackingNumber: string; name?: string }): Promise<string> {
  const db = adminStore();
  const from = process.env.ORDER_FROM_EMAIL, apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) throw new Error("Shipping email is not configured.");
  const pairKey = shipmentKey(shipment.email, shipment.trackingNumber);
  const proposed: PendingReceipt = {
    status: "pending", email: shipment.email.toLowerCase(), trackingNumber: shipment.trackingNumber,
    source: "manual", startedAt: Date.now(), message: { from, to: shipment.email, ...shippingEmail(shipment) },
  };
  const receipt = await db.eval<unknown[], PendingReceipt>(
    "redis.call('SET', KEYS[1], ARGV[1], 'NX'); return redis.call('GET', KEYS[1])", [pairKey], [JSON.stringify(proposed)],
  );
  if (receipt.status === "accepted" && receipt.id) return receipt.id;
  if (receipt.reference || !receipt.message || !Number.isFinite(receipt.startedAt) || Date.now() - receipt.startedAt >= 23 * 60 * 60 * 1000)
    throw new Error("Shared shipping receipt needs manual review before retrying.");
  const hash = digest(`${shipment.email.toLowerCase()}\n${shipment.trackingNumber}`);
  const result = await new Resend(apiKey).emails.send(receipt.message, { idempotencyKey: `shipping-${hash}` });
  if (result.error || !result.data?.id) throw new Error("Email acceptance unconfirmed; reconcile the pending receipt before retrying.");
  const accepted: ShippingReceipt = { ...publicReceipt(receipt), status: "accepted", id: result.data.id, acceptedAt: new Date().toISOString() };
  await db.eval("redis.call('SET', KEYS[1], ARGV[1]); redis.call('HSET', KEYS[2], ARGV[2], ARGV[1]); return 1", [pairKey, historyKey(shipment.email)], [JSON.stringify(accepted), hash]);
  return accepted.id!;
}
