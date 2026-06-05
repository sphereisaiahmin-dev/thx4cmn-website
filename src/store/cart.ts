'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getProductById, type Product } from '@/data/products';
import { normalizeCheckoutQuantity } from '@/lib/checkout';
import {
  isPersistedCartExpired,
  normalizePersistedCartItems,
} from '@/lib/cartPersistence';

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
  updatedAt: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const getCartTimestamp = () => Date.now();

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      updatedAt: getCartTimestamp(),
      addItem: (item) =>
        set((state) => {
          const product = getProductById(item.productId);
          if (product?.purchaseStatus === 'coming-soon') {
            return state;
          }

          const normalizedQuantity = normalizeCheckoutQuantity(item.quantity);
          const existing = state.items.find((cartItem) => cartItem.productId === item.productId);
          if (existing) {
            return {
              updatedAt: getCartTimestamp(),
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
            updatedAt: getCartTimestamp(),
            items: [...state.items, { ...item, quantity: normalizedQuantity }],
          };
        }),
      removeItem: (productId) =>
        set((state) => ({
          updatedAt: getCartTimestamp(),
          items: state.items.filter((item) => item.productId !== productId),
        })),
      updateQuantity: (productId, quantity) =>
        set((state) => {
          const sanitizedQuantity = normalizeCheckoutQuantity(quantity);

          return {
            updatedAt: getCartTimestamp(),
            items: state.items.map((item) =>
              item.productId === productId
                ? { ...item, quantity: sanitizedQuantity }
                : item,
            ),
          };
        }),
      clear: () => set({ items: [], updatedAt: getCartTimestamp() }),
    }),
    {
      name: 'thx4cmn-cart',
      merge: (persistedState, currentState) => {
        const persistedCartState = persistedState as Partial<CartState> | undefined;
        if (isPersistedCartExpired(persistedCartState?.updatedAt)) {
          return currentState;
        }

        return {
          ...currentState,
          ...persistedCartState,
          updatedAt: persistedCartState?.updatedAt ?? currentState.updatedAt,
          items: normalizePersistedCartItems(persistedCartState?.items, getProductById),
        };
      },
    },
  ),
);
