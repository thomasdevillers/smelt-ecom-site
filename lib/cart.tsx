"use client";
import { createContext, useContext, useEffect, useReducer, useState, useCallback } from "react";
import { cartReducer, emptyCart, cartCount, cartSubtotal, type CartState, type CartAction } from "./cartReducer";

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
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch(JSON.parse(raw) as CartState);
    } catch {}
    setHydrated(true);
  }, []);

  // Persist after hydration.
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

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
