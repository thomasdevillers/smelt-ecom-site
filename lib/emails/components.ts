import { COLORS, FONT_STACK, escapeHtml } from "./theme";
import type { OrderItem } from "../orderTypes";
import type { ShippingAddress } from "../address";

const cell = `font-family:${FONT_STACK};font-size:15px;color:${COLORS.ink};padding:8px 0;`;

export function orderItemsTable(items: OrderItem[]): string {
  if (!items.length)
    return `<p style="${cell}">(no line items recorded)</p>`;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="${cell}border-bottom:1px solid ${COLORS.border};">${escapeHtml(i.name)}</td>` +
        `<td align="right" style="${cell}border-bottom:1px solid ${COLORS.border};">× ${i.qty}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

export function moneyRow(label: string, value: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">` +
    `<tr><td style="${cell}font-weight:600;">${escapeHtml(label)}</td>` +
    `<td align="right" style="${cell}font-weight:600;">${escapeHtml(value)}</td></tr></table>`
  );
}

export function addressBlock(a: ShippingAddress): string {
  // When line1 was swapped for the full formatted address (see the
  // checkout page's Paystack payload), suburb/city/province/postalCode/
  // country are already spelled out inside it — repeating them below would
  // just duplicate the same info.
  const line1IsFullAddress = Boolean(a.formattedAddress) && a.line1 === a.formattedAddress;
  const lines = [
    a.line1,
    a.addressLine2,
    a.company,
    !line1IsFullAddress && (a.suburb ? `${a.suburb}, ${a.city}` : a.city),
    !line1IsFullAddress && `${a.province} ${a.postalCode}`,
    !line1IsFullAddress && a.country,
    a.phone,
  ]
    .filter(Boolean)
    .map((l) => escapeHtml(String(l)))
    .join("<br/>");
  return `<p style="${cell}">${lines}</p>`;
}
