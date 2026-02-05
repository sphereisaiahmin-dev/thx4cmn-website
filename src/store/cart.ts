'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Product } from '@/data/products';

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  currency: string;
  quantity: number;
  type: Product['type'];
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((cartItem) => cartItem.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((cartItem) =>
                cartItem.productId === item.productId
                  ? { ...cartItem, quantity: cartItem.quantity + item.quantity }
                  : cartItem,
              ),
            };
          }

          return { items: [...state.items, item] };
        }),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        })),
      updateQuantity: (productId, quantity) =>
        set((state) => {
          const sanitizedQuantity = Number.isFinite(quantity)
            ? Math.max(1, Math.floor(quantity))
            : 1;

          return {
            items: state.items.map((item) =>
              item.productId === productId
                ? { ...item, quantity: sanitizedQuantity }
                : item,
            ),
          };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'thx4cmn-cart',
    },
  ),
);
