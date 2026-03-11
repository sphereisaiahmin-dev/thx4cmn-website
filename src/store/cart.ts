'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Product } from '@/data/products';
import { normalizeCheckoutQuantity } from '@/lib/checkout';

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
          const normalizedQuantity = normalizeCheckoutQuantity(item.quantity);
          const existing = state.items.find((cartItem) => cartItem.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((cartItem) =>
                cartItem.productId === item.productId
                  ? {
                      ...cartItem,
                      quantity: normalizeCheckoutQuantity(cartItem.quantity + normalizedQuantity),
                    }
                  : cartItem,
              ),
            };
          }

          return {
            items: [...state.items, { ...item, quantity: normalizedQuantity }],
          };
        }),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        })),
      updateQuantity: (productId, quantity) =>
        set((state) => {
          const sanitizedQuantity = normalizeCheckoutQuantity(quantity);

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
      merge: (persistedState, currentState) => {
        const persistedItems = Array.isArray((persistedState as Partial<CartState>)?.items)
          ? (persistedState as Partial<CartState>).items ?? []
          : [];

        return {
          ...currentState,
          ...(persistedState as Partial<CartState>),
          items: persistedItems
            .filter(
              (item): item is CartItem =>
                typeof item?.productId === 'string' &&
                typeof item.name === 'string' &&
                typeof item.priceCents === 'number' &&
                typeof item.currency === 'string' &&
                typeof item.type === 'string',
            )
            .map((item) => ({
              ...item,
              quantity: normalizeCheckoutQuantity(item.quantity),
            })),
        };
      },
    },
  ),
);
