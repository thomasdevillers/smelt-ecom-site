import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderRow } from "@/app/admin/AdminDashboard";
import { normalizeOrder } from "./orders";
import type { ShippingReceipt } from "./types";

const previous: ShippingReceipt = {
  status: "accepted", reference: "older-order", email: "repeat@example.com",
  trackingNumber: "25249853610844", startedAt: Date.UTC(2026, 8, 15), source: "dashboard", id: "previous-email",
};
const order = () => ({
  ...normalizeOrder({ reference: "new-order", status: "success", amount: 54000, currency: "ZAR",
    customer: { email: previous.email }, metadata: { customerName: "Repeat Customer", cart: { green: 1 } } }),
  history: [previous],
});
const render = (value: ReturnType<typeof order>) => renderToStaticMarkup(createElement(OrderRow, {
  order: value, onReceipt: () => {}, onExpired: () => {}, onMoved: () => {},
}));

describe("repeat-customer order fulfilment", () => {
  it("shows the new order's shipping form despite an accepted previous shipment", () => {
    const html = render(order());
    expect(html).toContain("Ready to notify");
    expect(html).toContain("Aramex waybill number");
    expect(html).toContain("Send email ↗");
    expect(html).toContain(previous.trackingNumber);
    expect(html).not.toContain("Mark complete");
    expect(html).not.toContain("Previous email accepted");
    expect(html).not.toContain('type="checkbox"');
  });
  it("offers completion only after the new order has its own accepted shipment", () => {
    const html = render({ ...order(), receipt: { ...previous, reference: "new-order", id: "new-email" } });
    expect(html).toContain("Mark complete ✓");
    expect(html).not.toContain("Send email ↗");
  });
});
