import React, { createContext, useContext, useReducer } from 'react';

export type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
};

type CartState = { items: CartItem[] };

type CartAction =
  | { type: 'ADD_ITEM'; product: { id: number; name: string; price: number } }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'CLEAR_CART' };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.productId === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === action.product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
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
      return { items: state.items.filter((i) => i.productId !== action.productId) };
    case 'CLEAR_CART':
      return { items: [] };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  total: number;
  addItem: (product: { id: number; name: string; price: number }) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const total = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        total,
        addItem: (product) => dispatch({ type: 'ADD_ITEM', product }),
        removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
        clearCart: () => dispatch({ type: 'CLEAR_CART' }),
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
