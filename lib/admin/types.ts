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
