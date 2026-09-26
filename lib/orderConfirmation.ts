import { resolvePurchasePreorder } from "./preorderStore";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { ownerOrderEmail } from "./emails/ownerOrder";
import { orderConfirmationEmail } from "./emails/orderConfirmation";
import { sanitizeAddress } from "./address";
import { discountedCheckoutTotal, sanitizeCart } from "./checkoutShared";
import { PRODUCT } from "./product";
import type { CartState } from "./cartReducer";
import { formatMoney, parseShippingMethod } from "./pricing";
import { parseVoucherMetadata } from "./vouchers";

export interface ConfirmedOrder {
  reference: string;
  customerName?: unknown;
  paidAt?: string | null;
  email: string;
  amount: number; // Paystack-confirmed cents
  currency: string;
  cart: unknown;
  address?: unknown;
  shippingMethod?: unknown;
  preorder?: unknown;
  voucher?: unknown;
}

type Message = { from: string; to: string; subject: string; html: string; text: string };
type Receipt = { status: "accepted"; id: string } | { status: "pending"; startedAt: number; message: Message };
// Keep the first payload unchanged across concurrent callbacks, deployments, and retries.
export const PREPARE_CONFIRMATION = `
redis.call('SET', KEYS[1], ARGV[1], 'NX')
return redis.call('GET', KEYS[1])`;
const RETRY_WINDOW = 23 * 60 * 60 * 1000;

/** Call only after authenticated payment success and amount reconciliation. */
async function sendOrderEmail(order: ConfirmedOrder, audience: "customer" | "owner"): Promise<void> {
  const reference = typeof order.reference === "string" ? order.reference.trim() : "";
  const email = typeof order.email === "string" ? order.email.trim() : "";
  const cart = sanitizeCart(order.cart);
  const voucher = parseVoucherMetadata(order.voucher);
  const expectedTotal = discountedCheckoutTotal(cart, order.shippingMethod, voucher?.amount ?? 0);
  if (!reference || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ||
      expectedTotal <= 0 || order.currency !== "ZAR" || expectedTotal * 100 !== order.amount) {
    throw new Error("order_confirmation_invalid_payment_data");
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("order_confirmation_missing_redis_configuration");
  }
  const db = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000),
  });
  const hash = createHash("sha256").update(reference).digest("hex");
  const family = audience === "owner" ? "owner-order" : "order-confirmation";
  const key = `smelt:${family}:v1:${hash}`;
  let receipt = await db.get<Receipt>(key);
  if (receipt?.status === "accepted") return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  if (!apiKey || !from || from.includes("@resend.dev")) throw new Error("order_confirmation_missing_resend_configuration");
  if (!receipt) {
    const site = new URL(process.env.SITE_URL || "https://saunahat.co.za");
    if (site.protocol !== "https:" || site.username || site.password) throw new Error("order_confirmation_invalid_site_url");
    const items = (Object.keys(cart) as Array<keyof CartState>)
      .filter((colour) => cart[colour] > 0)
      .map((colour) => ({ colour, name: PRODUCT.variants[colour].name, qty: cart[colour] }));
    const details = {
      reference, total: formatMoney(order.amount / 100), items, preorder: await resolvePurchasePreorder(reference, order.preorder), discount: voucher?.amount,
      shippingMethod: parseShippingMethod(order.shippingMethod)!,
      address: order.address ? sanitizeAddress(order.address) : null,
    };
    const message = audience === "owner"
      ? ownerOrderEmail({ ...details, email, customerName: typeof order.customerName === "string" ? order.customerName.trim() : "", paidAt: order.paidAt, cart, test: !process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") })
      : orderConfirmationEmail(details);
    receipt = await db.eval<unknown[], Receipt>(PREPARE_CONFIRMATION, [key], [JSON.stringify({
      status: "pending", startedAt: Date.now(), message: { from, to: audience === "owner" ? "thomasdevilliers100@gmail.com" : email, ...message },
    })]);
  }
  if (receipt.status === "accepted") return;
  if (!Number.isFinite(receipt.startedAt) || Date.now() - receipt.startedAt >= RETRY_WINDOW) {
    // Resend forgets idempotency keys after 24h. Never risk a duplicate after an ambiguous send.
    throw new Error("order_confirmation_manual_review_required");
  }
  const result = await new Resend(apiKey).emails.send(receipt.message, { idempotencyKey: `${family}/${hash}` });
  if (result.error || !result.data?.id) throw new Error("order_confirmation_resend_not_accepted");
  // No TTL: late webhook replays must not recreate previously accepted confirmations.
  // Drop customer/address/message data once Resend has accepted the email.
  await db.set(key, { status: "accepted", id: result.data.id } satisfies Receipt);
  console.log("Order email accepted", { audience, receipt: hash, emailId: result.data.id });
}

export async function sendOrderConfirmation(order: ConfirmedOrder): Promise<void> {
  await sendOrderEmail(order, "customer");
}

export async function sendOwnerOrderNotification(order: ConfirmedOrder): Promise<void> {
  await sendOrderEmail(order, "owner");
}

// Attempt both independently; the webhook retries if either email is pending.
// Each recipient has a separate permanent receipt, so retries cannot resend the other.
export async function sendOrderNotifications(order: ConfirmedOrder): Promise<void> {
  const results = await Promise.allSettled([sendOrderConfirmation(order), sendOwnerOrderNotification(order)]);
  const failed = results.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

/** Checkout fallback: an email failure must not turn a paid order into a failed payment. */
export async function tryOrderConfirmation(order: ConfirmedOrder): Promise<void> {
  try {
    await sendOrderNotifications(order);
  } catch (error) {
    logOrderConfirmationFailure(order.reference, error);
  }
}

export function logOrderConfirmationFailure(reference: string, error: unknown) {
  const code = error instanceof Error && error.message.startsWith("order_confirmation_")
    ? error.message : "order_confirmation_provider_or_storage_error";
  console.error("Order confirmation pending; webhook retry or manual review required", {
    reference, code,
  });
}
