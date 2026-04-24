import React, { createContext, useContext, useReducer } from 'react';

export type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};

type CartState = {
  items: CartItem[];
  bundlePrice: number | null;
};

type BundleItemInput = { id: number; name: string; quantity: number };

type CartAction =
  | { type: 'ADD_ITEM'; product: { id: number; name: string; price: number; variantId?: number; variantName?: string } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'DECREMENT_ITEM'; productId: number; variantId?: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_BUNDLE'; bundleItems: BundleItemInput[]; price: number };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const matchIndex = state.items.findIndex((i) =>
        i.productId === action.product.id &&
        i.variantId === action.product.variantId
      );
      if (matchIndex >= 0) {
        return {
          bundlePrice: null,
          items: state.items.map((i, idx) =>
            idx === matchIndex ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        bundlePrice: null,
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
      return { items: [], bundlePrice: null };
    case 'SET_BUNDLE':
      return {
        bundlePrice: action.price,
        items: action.bundleItems.map((i) => ({
          productId: i.id,
          productName: i.name,
          price: 0,
          quantity: i.quantity,
        })),
      };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  total: number;
  bundlePrice: number | null;
  addItem: (product: { id: number; name: string; price: number; variantId?: number; variantName?: string }) => void;
  removeItem: (productId: number) => void;
  decrementItem: (productId: number, variantId?: number) => void;
  clearCart: () => void;
  setBundle: (bundleItems: BundleItemInput[], price: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], bundlePrice: null });

  const total = state.bundlePrice !== null
    ? state.bundlePrice
    : state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        total,
        bundlePrice: state.bundlePrice,
        addItem: (product) => dispatch({ type: 'ADD_ITEM', product }),
        removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
        decrementItem: (productId, variantId) => dispatch({ type: 'DECREMENT_ITEM', productId, variantId }),
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
