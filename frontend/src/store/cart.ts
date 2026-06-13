"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Product } from "@/types/api";

export interface CartLine {
  productId: string;
  title: string;
  unitPrice: string;
  imageUrl: string | null;
  qty: number;
  stockQty: number;
}

interface CartState {
  items: Record<string, CartLine>;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "shopflow.cart.v1";

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      add: (product, qty = 1) =>
        set((state) => {
          const existing = state.items[product.id];
          const existingQty = existing?.qty ?? 0;
          const desired = existingQty + qty;
          // Clamp at on-hand stock so the cart can never exceed inventory.
          const newQty = Math.min(desired, product.stock_qty);
          if (newQty <= 0) return state;
          return {
            items: {
              ...state.items,
              [product.id]: {
                productId: product.id,
                title: product.title,
                unitPrice: product.price,
                imageUrl: product.images[0] ?? null,
                qty: newQty,
                stockQty: product.stock_qty,
              },
            },
          };
        }),
      setQty: (productId, qty) =>
        set((state) => {
          const existing = state.items[productId];
          if (!existing) return state;
          if (qty <= 0) {
            const { [productId]: _, ...rest } = state.items;
            return { items: rest };
          }
          return {
            items: {
              ...state.items,
              [productId]: { ...existing, qty: Math.min(qty, existing.stockQty) },
            },
          };
        }),
      remove: (productId) =>
        set((state) => {
          const { [productId]: _, ...rest } = state.items;
          return { items: rest };
        }),
      clear: () => set({ items: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist items — actions are pure functions.
      partialize: (s) => ({ items: s.items }),
      version: 1,
    },
  ),
);

// Selectors — pre-computed to avoid re-derivation on every render.
export function useCartCount(): number {
  return useCart((s) =>
    Object.values(s.items).reduce((acc, line) => acc + line.qty, 0),
  );
}

export function useCartSubtotal(): number {
  return useCart((s) =>
    Object.values(s.items).reduce(
      (acc, line) => acc + Number(line.unitPrice) * line.qty,
      0,
    ),
  );
}

export function useCartLines(): CartLine[] {
  return useCart((s) => Object.values(s.items));
}
