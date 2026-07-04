import { lineTotal } from "./pricing";
import type { Colour } from "./product";

export interface CartState {
  green: number;
  cream: number;
}

export const emptyCart: CartState = { green: 0, cream: 0 };

export type CartAction =
  | { type: "add"; colour: Colour; qty: number }
  | { type: "set"; colour: Colour; qty: number }
  | { type: "remove"; colour: Colour }
  | { type: "clear" };

export function cartReducer(state: CartState, action: CartState | CartAction): CartState {
  // Allow rehydration by passing a plain state object.
  if (!("type" in action)) return { green: action.green ?? 0, cream: action.cream ?? 0 };
  switch (action.type) {
    case "add":
      return { ...state, [action.colour]: Math.max(0, state[action.colour] + action.qty) };
    case "set":
      return { ...state, [action.colour]: Math.max(0, action.qty) };
    case "remove":
      return { ...state, [action.colour]: 0 };
    case "clear":
      return emptyCart;
    default:
      return state;
  }
}

export function cartCount(state: CartState): number {
  return state.green + state.cream;
}

export function cartSubtotal(state: CartState): number {
  return lineTotal(state.green) + lineTotal(state.cream);
}
