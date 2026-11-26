import type { OrderItem } from "../orderTypes";
import type { MetaClientContext } from "../meta";

export interface PaystackEvent {
  event?: string;
  data?: {
    id?: number;
    domain?: string;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    customer?: { email?: string };
    metadata?: {
      customerName?: unknown;
      cart?: unknown;
      items?: OrderItem[];
      amountRand?: number;
      metaClient?: MetaClientContext;
      shippingAddress?: { phone?: unknown };
      shippingMethod?: unknown;
      inventoryReservation?: unknown;
      preorder?: unknown;
      voucher?: unknown;
      unitPrice?: unknown;
      pricingVersion?: unknown;
      attribution?: unknown;
    };
  };
}

export function parsePaystackEvent(raw: string): PaystackEvent {
  const event = JSON.parse(raw);
  if (
    !event ||
    typeof event !== "object" ||
    Array.isArray(event) ||
    typeof event.event !== "string" ||
    !event.event ||
    !event.data ||
    typeof event.data !== "object" ||
    Array.isArray(event.data)
  )
    throw new Error("Invalid Paystack event.");
  return event;
}
