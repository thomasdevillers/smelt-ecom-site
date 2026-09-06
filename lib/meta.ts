import type { CartState } from "./cartReducer";
import { COLOURS, PRODUCT, type Colour } from "./product";
import { lineTotal } from "./pricing";

export const META_PIXEL_ID = "1752185435933821";
export const META_CURRENCY = "ZAR";

export interface MetaContent {
  id: string;
  quantity: number;
  item_price?: number;
}

export interface MetaClientContext {
  fbp?: string;
  fbc?: string;
  clientUserAgent?: string;
}

export function metaContentId(colour: string): string {
  return `smelt-sauna-hat-${colour}`;
}

export function metaVariantContent(colour: Colour, quantity: number): MetaContent {
  return {
    id: metaContentId(colour),
    quantity,
    item_price: quantity > 0 ? lineTotal(quantity) / quantity : undefined,
  };
}

export function metaCartContents(cart: CartState): MetaContent[] {
  return COLOURS.filter((colour) => cart[colour] > 0).map((colour) =>
    metaVariantContent(colour, cart[colour]),
  );
}

export function metaVariantName(colour: Colour): string {
  return PRODUCT.variants[colour].name;
}
