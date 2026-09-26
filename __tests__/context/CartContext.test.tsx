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

  it('removeLine removes the whole line regardless of quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));
    act(() => result.current.addItem(product));
    act(() => result.current.addItem(product2));
    act(() => result.current.removeLine(1));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe(2);
  });

  it('removeLine only removes the matching variant line', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem({ ...product, variantId: 10, variantName: 'A' }));
    act(() => result.current.addItem({ ...product, variantId: 11, variantName: 'B' }));
    act(() => result.current.removeLine(1, 10));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].variantId).toBe(11);
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

  it('addPrize adds a free prize line excluded from the total', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product2));   // 45 paid
    act(() => result.current.addPrize(product));    // prize, 0
    expect(result.current.items).toHaveLength(2);
    const prizeLine = result.current.items.find((i) => i.productId === product.id);
    expect(prizeLine).toMatchObject({ isPrize: true, quantity: 1 });
    expect(result.current.total).toBe(45);
  });

  it('addPrize does NOT convert an existing paid line (revenue is preserved)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(product));    // paid qty 1, total 120
    act(() => result.current.addPrize(product));    // same product already paid -> no-op
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].isPrize).toBeFalsy();
    expect(result.current.items[0].quantity).toBe(1);
    expect(result.current.total).toBe(120);
  });

  it('addItem does not merge into a prize line (adds a separate paid line)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addPrize(product));    // prize, 0
    act(() => result.current.addItem(product));     // paid -> separate line, not merged
    expect(result.current.items).toHaveLength(2);
    const prize = result.current.items.find((i) => i.isPrize);
    const paid = result.current.items.find((i) => !i.isPrize);
    expect(prize).toMatchObject({ quantity: 1 });
    expect(paid).toMatchObject({ quantity: 1 });
    expect(result.current.total).toBe(120);
  });

  it('addPrize twice keeps the line a prize and bumps quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addPrize(product));
    act(() => result.current.addPrize(product));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ isPrize: true, quantity: 2 });
    expect(result.current.total).toBe(0);
  });

  it('throws when used outside CartProvider', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within CartProvider');
  });
});
