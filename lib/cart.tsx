"use client";
import { createContext, useContext, useEffect, useReducer, useState, useCallback } from "react";
import { cartReducer, emptyCart, cartCount, cartSubtotal, type CartState, type CartAction } from "./cartReducer";
import { META_CURRENCY, metaVariantContent, metaVariantName } from "./meta";
import { trackMetaEvent } from "./metaPixel";

import { tiktokContent } from "./tiktok";
import { trackTikTokEvent } from "./tiktokPixel";

import { trackVercelEvent, vercelProductData } from "./vercelAnalytics";

const STORAGE_KEY = "smelt-cart-v1";

interface CartContextValue {
  cart: CartState;
  dispatch: (a: CartAction) => void;
  count: number;
  subtotal: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, baseDispatch] = useReducer(cartReducer, emptyCart);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) baseDispatch(JSON.parse(raw) as CartState);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Persist after hydration.
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const dispatch = useCallback((action: CartAction) => {
    baseDispatch(action);
    if (action.type === "add" && action.qty > 0) {
      trackVercelEvent("AddToCart", vercelProductData(action.colour, action.qty));
      const content = metaVariantContent(action.colour, action.qty);
      trackTikTokEvent("AddToCart", {
        contents: [tiktokContent(action.colour, action.qty)],
        value: content.item_price! * content.quantity,
        currency: "ZAR",
      });
      trackMetaEvent("AddToCart", {
        content_name: metaVariantName(action.colour),
        content_ids: [content.id],
        contents: [content],
        content_type: "product",
        currency: META_CURRENCY,
        value: content.item_price! * content.quantity,
      });
    }
  }, []);

  return (
    <CartContext.Provider
      value={{ cart, dispatch, count: cartCount(cart), subtotal: cartSubtotal(cart), isOpen, openCart, closeCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
