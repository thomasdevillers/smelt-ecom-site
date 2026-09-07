import type { CartState } from "./cartReducer";
import { COLOURS, PRODUCT, type Colour } from "./product";
import { unitPrice } from "./pricing";

export function tiktokContent(colour: Colour, quantity: number) {
  return {
    content_id: `smelt-sauna-hat-${colour}`,
    content_type: "product" as const,
    content_name: `${PRODUCT.name} - ${PRODUCT.variants[colour].name}`,
    quantity,
    price: unitPrice(quantity),
  };
}

export function tiktokCartParameters(cart: CartState, value: number) {
  return {
    contents: COLOURS.filter((colour) => cart[colour] > 0).map((colour) =>
      tiktokContent(colour, cart[colour]),
    ),
    value,
    currency: "ZAR",
  };
}

export const TIKTOK_PIXEL_ID = "DAFEQ6BC77UES974NGD0";
export interface TikTokClientContext { ttclid?: string; ttp?: string; user_agent?: string }

export function normalizeTikTokPhone(phone: string): string | undefined {
  const cleaned = phone.trim().replace(/[\s().-]/g, "");
  const international = cleaned.startsWith("00") ? `+${cleaned.slice(2)}`
    : /^0\d{9}$/.test(cleaned) ? `+27${cleaned.slice(1)}`
    : /^27\d{9}$/.test(cleaned) ? `+${cleaned}` : cleaned;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : undefined;
}
