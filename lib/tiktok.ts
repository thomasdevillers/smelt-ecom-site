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
