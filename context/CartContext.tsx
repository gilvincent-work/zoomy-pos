import React, { createContext, useContext, useReducer } from 'react';
import type { BundleItemInput } from '../db/saved-bundles';

export type { BundleItemInput };

export type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  bundlePrice: number | null;
  bundleItems: BundleItemInput[] | null;
};

type CartAction =
  | { type: 'ADD_ITEM'; product: { id: number; name: string; price: number } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'DECREMENT_ITEM'; productId: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_BUNDLE'; bundleItems: BundleItemInput[]; price: number };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.productId === action.product.id);
      if (existing) {
        return {
          bundlePrice: null,
          bundleItems: null,
          items: state.items.map((i) =>
            i.productId === action.product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        bundlePrice: null,
        bundleItems: null,
        items: [
          ...state.items,
          {
            productId: action.product.id,
            productName: action.product.name,
            price: action.product.price,
            quantity: 1,
          },
        ],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'DECREMENT_ITEM': {
      const item = state.items.find((i) => i.productId === action.productId);
      if (!item) return state;
      if (item.quantity <= 1) {
        return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.productId ? { ...i, quantity: i.quantity - 1 } : i
        ),
      };
    }
    case 'CLEAR_CART':
      return { items: [], bundlePrice: null, bundleItems: null };
    case 'SET_BUNDLE':
      return {
        bundlePrice: action.price,
        bundleItems: action.bundleItems,
        // Single opaque item — productId 0 won't match any product tile
        items: [{ productId: 0, productName: 'Bundle', price: action.price, quantity: 1 }],
      };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  total: number;
  bundlePrice: number | null;
  bundleItems: BundleItemInput[] | null;
  addItem: (product: { id: number; name: string; price: number }) => void;
  removeItem: (productId: number) => void;
  decrementItem: (productId: number) => void;
  clearCart: () => void;
  setBundle: (bundleItems: BundleItemInput[], price: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    bundlePrice: null,
    bundleItems: null,
  });

  const total = state.bundlePrice !== null
    ? state.bundlePrice
    : state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        total,
        bundlePrice: state.bundlePrice,
        bundleItems: state.bundleItems,
        addItem: (product) => dispatch({ type: 'ADD_ITEM', product }),
        removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
        decrementItem: (productId) => dispatch({ type: 'DECREMENT_ITEM', productId }),
        clearCart: () => dispatch({ type: 'CLEAR_CART' }),
        setBundle: (bundleItems, price) => dispatch({ type: 'SET_BUNDLE', bundleItems, price }),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
