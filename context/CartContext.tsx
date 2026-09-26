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
  /** Marked as a spin-a-wheel prize (free item). A prize line keeps its price
   *  (so un-marking restores it) but is excluded from the sale total and is
   *  recorded separately as a prize, never as a paid sale line. */
  isPrize?: boolean;
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
  | { type: 'ADD_PRIZE'; product: { id: number; name: string; price: number; variantId?: number; variantName?: string } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'REMOVE_LINE'; productId: number; variantId?: number }
  | { type: 'DECREMENT_ITEM'; productId: number; variantId?: number }
  | { type: 'TOGGLE_PRIZE'; productId: number; variantId?: number }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_BUNDLES' }
  | { type: 'ADD_BUNDLE'; bundle: CartBundle }
  | { type: 'REMOVE_BUNDLE'; cartId: string };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      // Never merge a paid add into a prize line (that would silently make the
      // paid unit free). A prize line is only ever grown via ADD_PRIZE.
      const matchIndex = state.items.findIndex((i) =>
        i.productId === action.product.id &&
        i.variantId === action.product.variantId &&
        !i.isPrize
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
    case 'ADD_PRIZE': {
      // A won prize (spin-a-wheel free item), added like picking a bundle. It
      // only ever grows an existing PRIZE line for the same product/variant (a
      // second win of the same item bumps its quantity), and rides the exact same
      // total-exclusion and checkout split as the per-line gift toggle. It must
      // NEVER touch a paid line: converting a paid line to a free prize would
      // silently zero real revenue, so if the only matching line is a paid one we
      // leave the cart unchanged (the picker guards against this too). With no
      // matching prize line, add a fresh qty-1 prize line.
      const prizeIndex = state.items.findIndex((i) =>
        i.productId === action.product.id &&
        i.variantId === action.product.variantId &&
        i.isPrize
      );
      if (prizeIndex >= 0) {
        return {
          ...state,
          items: state.items.map((i, idx) =>
            idx === prizeIndex ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      const paidExists = state.items.some((i) =>
        i.productId === action.product.id &&
        i.variantId === action.product.variantId &&
        !i.isPrize
      );
      if (paidExists) return state;
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
            isPrize: true,
          },
        ],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'REMOVE_LINE':
      return {
        ...state,
        items: state.items.filter(
          (i) => !(i.productId === action.productId && i.variantId === action.variantId)
        ),
      };
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
    case 'TOGGLE_PRIZE':
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.productId && i.variantId === action.variantId
            ? { ...i, isPrize: !i.isPrize }
            : i
        ),
      };
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
  addPrize: (product: { id: number; name: string; price: number; variantId?: number; variantName?: string }) => void;
  removeItem: (productId: number) => void;
  removeLine: (productId: number, variantId?: number) => void;
  decrementItem: (productId: number, variantId?: number) => void;
  togglePrize: (productId: number, variantId?: number) => void;
  clearCart: () => void;
  clearBundles: () => void;
  addBundle: (bundle: Omit<CartBundle, 'cartId'>) => void;
  removeBundle: (cartId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], bundles: [] });

  // Prize lines are free giveaways: they never contribute to the sale total
  // (they're recorded separately as prizes).
  const total =
    state.bundles.reduce((sum, b) => sum + b.price, 0) +
    state.items.reduce((sum, i) => sum + (i.isPrize ? 0 : i.price * i.quantity), 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        bundles: state.bundles,
        total,
        addItem: (product) => dispatch({ type: 'ADD_ITEM', product }),
        addPrize: (product) => dispatch({ type: 'ADD_PRIZE', product }),
        removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
        removeLine: (productId, variantId) => dispatch({ type: 'REMOVE_LINE', productId, variantId }),
        decrementItem: (productId, variantId) => dispatch({ type: 'DECREMENT_ITEM', productId, variantId }),
        togglePrize: (productId, variantId) => dispatch({ type: 'TOGGLE_PRIZE', productId, variantId }),
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
