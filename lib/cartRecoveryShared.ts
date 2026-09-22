import type { CartState } from "./cartReducer";
import type { VoucherReward } from "./vouchers";

export const CART_RECOVERY_STORAGE_KEY = "smelt-cart-recovery-v1";
export type CartRecoveryData = { email: string; name: string; cart: CartState; voucher: VoucherReward };
