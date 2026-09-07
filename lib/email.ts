// Payment-failed emails via Resend. Safe no-op when RESEND_API_KEY is unset.
//
// Env vars:
//   RESEND_API_KEY   – required to actually send.
//   ORDER_FROM_EMAIL – sender address. Defaults to Resend's sandbox sender,
//                      which can only deliver to your own Resend account email.
//                      Set to "Smelt <orders@saunahat.co.za>" once the domain
//                      is verified in Resend.
import { Resend } from "resend";
import type { OrderItem } from "./orderTypes";
import { paymentFailedEmail } from "./emails/paymentFailed";
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

export async function sendPaymentFailedEmail(d: {
  email: string;
  items: OrderItem[];
}): Promise<void> {
  if (!d.email) return;
  const e = paymentFailedEmail({ items: d.items, retryUrl: absoluteUrl("/checkout") });
  await send(d.email, e.subject, e.html, e.text);
}
