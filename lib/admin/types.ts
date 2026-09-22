import type { ShippingAddress } from "../address";
import type { OrderItem } from "../orderTypes";
export interface ShippingReceipt {
  status: "pending" | "accepted";
  trackingNumber: string;
  email: string;
  reference?: string;
  startedAt: number;
  acceptedAt?: string;
  id?: string;
  source: "dashboard" | "manual";
  lastEvent?: string;
}
export interface AdminOrder {
  reference: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  items: OrderItem[];
  address: ShippingAddress;
  shippingMethod: string;
  preorder?: import("../preorders").PreorderDetails;
  canShip: boolean;
  reviewReason?: string;
  receipt: ShippingReceipt | null;
  history: ShippingReceipt[];
  completedAt: string | null;
}
export interface OrdersPage {
  orders: AdminOrder[];
  page: number;
  pageCount: number;
  total: number;
  activeTotal: number;
  completedTotal: number;
}

export type AnalyticsDays = 7 | 28 | 90;

export interface AnalyticsPeriod {
  start: string;
  end: string;
  visitors: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  paymentOpened: number;
  paymentCancelled: number;
  checkoutErrors: number;
  orders: number;
  revenue: number;
}

export interface ConversionAnalytics {
  days: AnalyticsDays;
  generatedAt: string;
  mode: "live" | "test";
  current: AnalyticsPeriod;
  previous: AnalyticsPeriod;
}
