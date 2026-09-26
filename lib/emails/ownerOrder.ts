import { renderEmail } from './layout';
import { addressBlock, moneyRow, orderItemsTable } from './components';
import { absoluteUrl, escapeHtml } from './theme';
import { formatMoney, shippingFee, SHIPPING_OPTIONS, type ShippingMethod } from '../pricing';
import { cartSubtotal, type CartState } from '../cartReducer';
import { parsePreorder, preorderTiming } from '../preorders';
import type { ShippingAddress } from '../address';
import type { OrderItem } from '../orderTypes';

export function ownerOrderEmail(d: {
  reference: string; email: string; customerName: string; paidAt?: string | null;
  total: string; cart: CartState; items: OrderItem[]; address: ShippingAddress | null;
  shippingMethod: ShippingMethod; discount?: number; preorder?: unknown; test: boolean;
}) {
  const preorder = parsePreorder(d.preorder);
  const subtotal = cartSubtotal(d.cart);
  const date = d.paidAt && Number.isFinite(Date.parse(d.paidAt))
    ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(d.paidAt)) + ' SAST'
    : 'Not supplied by payment provider';
  const row = (label: string, value: string) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
  const { html, text } = renderEmail({
    preheader: 'A successful Smelt payment has been confirmed.',
    heading: d.test ? 'Test order received' : 'New paid order',
    blocks: [
      row('Order reference', d.reference),
      row('Paid at', date),
      row('Customer', d.customerName || 'Name not supplied'),
      row('Email', d.email),
      row('Phone', d.address?.phone || 'Not supplied'),
      orderItemsTable(d.items),
      moneyRow('Items subtotal', formatMoney(subtotal)),
      moneyRow('Delivery', formatMoney(shippingFee(subtotal, d.shippingMethod))),
      ...(d.discount ? [moneyRow('Voucher discount', `−${formatMoney(d.discount)}`)] : []),
      moneyRow('Total paid (ZAR)', d.total),
      row('Delivery method', SHIPPING_OPTIONS[d.shippingMethod].label),
      '<p><strong>Delivery address</strong></p>',
      d.address ? addressBlock(d.address) : '<p>Not supplied</p>',
      ...(d.address?.formattedAddress && d.address.formattedAddress !== d.address.line1
        ? [row('Full address', d.address.formattedAddress)] : []),
      row('Order type', preorder ? 'Pre-order' : 'In-stock order'),
      ...(preorder ? [row('Pre-order quantities', `${preorder.quantities.green} green, ${preorder.quantities.cream} cream`), `<p>${escapeHtml(preorderTiming(preorder))}</p>`] : []),
    ],
    cta: { label: 'Open order admin', url: absoluteUrl('/admin') },
    signoff: 'Smelt order notifications',
  });
  return { subject: `${d.test ? '[TEST] ' : ''}New Smelt ${preorder ? 'pre-order' : 'order'} · ${d.total} · ${d.reference}`, html, text };
}
