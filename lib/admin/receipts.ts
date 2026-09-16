import type { ShippingReceipt } from "./types";
export function publicReceipt(receipt: ShippingReceipt): ShippingReceipt {
  // Never send the frozen HTML/email payload to the browser.
  const { status, trackingNumber, email, reference, startedAt, acceptedAt, id, source, lastEvent } = receipt;
  return { status, trackingNumber, email, reference, startedAt, acceptedAt, id, source, lastEvent };
}
