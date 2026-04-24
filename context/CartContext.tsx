import React, { createContext, useContext, useReducer } from 'react';
import type { BundleItemInput } from '../db/saved-bundles';

export type { BundleItemInput };

export type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};

export type CartBundle = {
  cartId: string;
  presetId: number | null;
  name: string;
  price: number;
  items: BundleItemInput[];
};

type CartState = {
  items: CartItem[];
  bundles: CartBundle[];
};

type CartAction =
  | { type: 'ADD_ITEM'; product: { id: number; name: string; price: number; variantId?: number; variantName?: string } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'DECREMENT_ITEM'; productId: number; variantId?: number }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_BUNDLES' }
  | { type: 'ADD_BUNDLE'; bundle: CartBundle }
  | { type: 'REMOVE_BUNDLE'; cartId: string };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const matchIndex = state.items.findIndex((i) =>
        i.productId === action.product.id &&
        i.variantId === action.product.variantId
      );
      if (matchIndex >= 0) {
        return {
          ...state,
          items: state.items.map((i, idx) =>
            idx === matchIndex ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            productId: action.product.id,
            productName: action.product.name,
            price: action.product.price,
            quantity: 1,
            variantId: action.product.variantId,
            variantName: action.product.variantName,
          },
        ],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'DECREMENT_ITEM': {
      const item = state.items.find((i) =>
        i.productId === action.productId &&
        (action.variantId === undefined || i.variantId === action.variantId)
      );
      if (!item) return state;
      if (item.quantity <= 1) {
        return {
          ...state,
          items: state.items.filter((i) =>
            !(i.productId === action.productId &&
              (action.variantId === undefined || i.variantId === action.variantId))
          ),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          (i.productId === action.productId &&
            (action.variantId === undefined || i.variantId === action.variantId))
            ? { ...i, quantity: i.quantity - 1 }
            : i
        ),
      };
    }
    case 'CLEAR_CART':
      return { items: [], bundles: [] };
    case 'CLEAR_BUNDLES':
      return { ...state, bundles: [] };
    case 'ADD_BUNDLE':
      return { ...state, bundles: [...state.bundles, action.bundle] };
    case 'REMOVE_BUNDLE':
      return { ...state, bundles: state.bundles.filter((b) => b.cartId !== action.cartId) };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  bundles: CartBundle[];
  total: number;
  addItem: (product: { id: number; name: string; price: number; variantId?: number; variantName?: string }) => void;
  removeItem: (productId: number) => void;
  decrementItem: (productId: number, variantId?: number) => void;
  clearCart: () => void;
  clearBundles: () => void;
  addBundle: (bundle: Omit<CartBundle, 'cartId'>) => void;
  removeBundle: (cartId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], bundles: [] });

  const total =
    state.bundles.reduce((sum, b) => sum + b.price, 0) +
    state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        bundles: state.bundles,
        total,
        addItem: (product) => dispatch({ type: 'ADD_ITEM', product }),
        removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
        decrementItem: (productId, variantId) => dispatch({ type: 'DECREMENT_ITEM', productId, variantId }),
        clearCart: () => dispatch({ type: 'CLEAR_CART' }),
        clearBundles: () => dispatch({ type: 'CLEAR_BUNDLES' }),
        addBundle: (bundle) =>
          dispatch({
            type: 'ADD_BUNDLE',
            bundle: { ...bundle, cartId: `${Date.now()}-${Math.random()}` },
          }),
        removeBundle: (cartId) => dispatch({ type: 'REMOVE_BUNDLE', cartId }),
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
