import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { CartProvider, useCart } from '../../context/CartContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

const product = { id: 1, name: 'Cake', price: 120, emoji: '🍰' };
const product2 = { id: 2, name: 'Drink', price: 45, emoji: '🥤' };

describe('useCart', () => {
  it('starts with empty cart and zero total', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('addItem adds a new item with quantity 1', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ productId: 1, quantity: 1 });
  });

  it('addItem increments quantity for existing item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));
    act(() => result.current.addItem(product));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });

  it('removeItem removes all quantity of an item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));
    act(() => result.current.addItem(product));
    act(() => result.current.removeItem(1));
    expect(result.current.items).toHaveLength(0);
  });

  it('clearCart empties all items', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));
    act(() => result.current.addItem(product2));
    act(() => result.current.clearCart());
    expect(result.current.items).toHaveLength(0);
  });

  it('total sums price × quantity for all items', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));   // 120
    act(() => result.current.addItem(product));   // 240
    act(() => result.current.addItem(product2));  // 285
    expect(result.current.total).toBe(285);
  });
});
