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

export interface OrderEmailData {
  reference: string;
  email: string;
  amountRand: number;
  items: OrderItem[];
}

function itemsText(items: OrderItem[]): string {
  if (!items.length) return "  (no line items recorded)";
  return items.map((i) => `  • ${i.name} × ${i.qty}`).join("\n");
}

function itemsHtml(items: OrderItem[]): string {
  if (!items.length) return "<li>(no line items recorded)</li>";
  return items.map((i) => `<li>${i.name} × ${i.qty}</li>`).join("");
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

  const tasks: Promise<unknown>[] = [];

  // Customer receipt.
  if (data.email) {
    tasks.push(
      resend().emails.send({
        from: fromAddress(),
        to: data.email,
        subject: "Your Smelt pre-order is confirmed. Warm regards.",
        text:
          `Thanks for pre-ordering a Smelt sauna hat.\n\n` +
          `Order reference: ${data.reference}\n` +
          `Total paid: ${total}\n\n` +
          `What you ordered:\n${itemsText(data.items)}\n\n` +
          `Every hat is hand-felted to order, so your pre-order ships with the ` +
          `founding batch, roughly four to six weeks out. We'll be in touch when ` +
          `it's on its way.\n\nWarm regards,\nTom & Marc`,
        html:
          `<h2>Your Smelt pre-order is confirmed</h2>` +
          `<p>Thanks for pre-ordering a Smelt sauna hat.</p>` +
          `<p><strong>Order reference:</strong> ${data.reference}<br/>` +
          `<strong>Total paid:</strong> ${total}</p>` +
          `<p><strong>What you ordered:</strong></p><ul>${itemsHtml(data.items)}</ul>` +
          `<p>Every hat is hand-felted to order, so your pre-order ships with the ` +
          `founding batch, roughly four to six weeks out. We'll be in touch when ` +
          `it's on its way.</p><p>Warm regards,<br/>Tom &amp; Marc</p>`,
      }),
    );
  }

  // Owner notification.
  if (notifyTo.length) {
    tasks.push(
      resend().emails.send({
        from: fromAddress(),
        to: notifyTo,
        subject: `New Smelt order: ${total} (${data.reference})`,
        text:
          `New paid order.\n\n` +
          `Reference: ${data.reference}\n` +
          `Customer: ${data.email}\n` +
          `Total: ${total}\n\n` +
          `Items:\n${itemsText(data.items)}`,
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("Order email failed:", r.reason);
  }
}
