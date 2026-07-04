// Order emails via Resend. Safe no-op when RESEND_API_KEY is unset.
//
// Env vars:
//   RESEND_API_KEY   – required to actually send.
//   ORDER_FROM_EMAIL – sender address. Defaults to Resend's sandbox sender,
//                      which can only deliver to your own Resend account email.
//                      Set to "Smelt <orders@saunahat.co.za>" once the domain
//                      is verified in Resend.
//   ORDER_NOTIFY_EMAIL – where the "new order" alert goes (you). Accepts a
//                        comma-separated list for multiple recipients.
import { Resend } from "resend";
import { formatMoney } from "./pricing";
import type { OrderItem } from "./orders";
import type { ShippingAddress } from "./address";
import { orderConfirmationEmail } from "./emails/orderConfirmation";
import { ownerAlertEmail } from "./emails/ownerAlert";
import { paymentFailedEmail } from "./emails/paymentFailed";
import { abandonedCartEmail } from "./emails/abandonedCart";
import { shippingEmail } from "./emails/shipping";
import { deliveredEmail } from "./emails/delivered";
import { welcomeEmail } from "./emails/welcome";
import { absoluteUrl } from "./emails/theme";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.ORDER_FROM_EMAIL || "Smelt <onboarding@resend.dev>";
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/**
 * Send a single email best-effort: no-op when unconfigured, errors swallowed
 * (logged) so email problems never break the caller.
 */
async function send(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    await resend().emails.send({ from: fromAddress(), to, subject, html, text });
  } catch (err) {
    console.error(`Email failed (${subject}):`, err);
  }
}

export interface OrderEmailData {
  reference: string;
  email: string;
  amountRand: number;
  items: OrderItem[];
  customerName?: string | null;
  shippingAddress?: ShippingAddress | null;
}

/**
 * Send both the customer receipt and the owner notification for a paid order.
 * Failures are swallowed (logged) so email problems never break the webhook.
 */
export async function sendOrderEmails(data: OrderEmailData): Promise<void> {
  if (!isEmailConfigured()) return;

  const total = formatMoney(data.amountRand);
  // ORDER_NOTIFY_EMAIL may hold a comma-separated list of recipients.
  const notifyTo = (process.env.ORDER_NOTIFY_EMAIL || "")
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);

  const tasks: Promise<void>[] = [];

  // Customer receipt.
  if (data.email) {
    const e = orderConfirmationEmail({
      reference: data.reference,
      total,
      items: data.items,
      address: data.shippingAddress ?? null,
    });
    tasks.push(send(data.email, e.subject, e.html, e.text));
  }

  // Owner notification.
  if (notifyTo.length) {
    const e = ownerAlertEmail({
      reference: data.reference,
      email: data.email,
      total,
      items: data.items,
      address: data.shippingAddress ?? null,
    });
    tasks.push(send(notifyTo, e.subject, e.html, e.text));
  }

  await Promise.all(tasks);
}

export async function sendPaymentFailedEmail(d: {
  email: string;
  items: OrderItem[];
}): Promise<void> {
  if (!d.email) return;
  const e = paymentFailedEmail({ items: d.items, retryUrl: absoluteUrl("/checkout") });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendAbandonedCartEmail(d: {
  email: string;
  name?: string | null;
  items: OrderItem[];
  total: string;
}): Promise<void> {
  if (!d.email) return;
  const e = abandonedCartEmail({
    name: d.name,
    items: d.items,
    total: d.total,
    cartUrl: absoluteUrl("/cart"),
  });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendShippingEmail(d: {
  email: string;
  name?: string | null;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  items: OrderItem[];
}): Promise<void> {
  if (!d.email) return;
  const e = shippingEmail({
    name: d.name,
    carrier: d.carrier,
    trackingNumber: d.trackingNumber,
    trackingUrl: d.trackingUrl,
    items: d.items,
  });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendDeliveredEmail(d: {
  email: string;
  name?: string | null;
}): Promise<void> {
  if (!d.email) return;
  const e = deliveredEmail({ name: d.name });
  await send(d.email, e.subject, e.html, e.text);
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  if (!email) return;
  const e = welcomeEmail();
  await send(email, e.subject, e.html, e.text);
}
