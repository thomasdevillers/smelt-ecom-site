// types/paystack.d.ts
import '@paystack/inline-js';
import type { CartState } from '../lib/cartReducer';
import type { OrderItem } from '../lib/orders';
import type { ShippingAddress } from '../lib/address';

declare module '@paystack/inline-js' {
  interface TransactionConfig {
    metadata?: {
      cart?: CartState;
      items?: OrderItem[];
      amountRand?: number;
      customerName?: string | null;
      shippingAddress?: ShippingAddress | null;
      // Also include custom_fields to match the base type
      custom_fields?: {
        display_name: string;
        variable_name: string;
        value?: string | number;
      }[];
      [key: string]: any;
    };
  }
}
