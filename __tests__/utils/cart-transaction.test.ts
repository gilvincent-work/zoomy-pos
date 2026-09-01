import { buildInsertItems } from '../../utils/cart-transaction';
import type { CartItem, CartBundle } from '../../context/CartContext';

const item: CartItem = { productId: 1, productName: 'Beef Strips', price: 95, quantity: 2 };
const variantItem: CartItem = {
  productId: 2, productName: 'Jerky', price: 80, quantity: 1, variantId: 7, variantName: 'Chicken',
};
const bundle: CartBundle = {
  cartId: 'c1',
  presetId: 3,
  name: 'Starter Pack',
  price: 150,
  items: [
    { id: 4, name: 'Salmon Cubes', quantity: 1 },
    { id: 5, name: 'Yogurt Cubes', quantity: 2 },
  ],
};

describe('buildInsertItems', () => {
  it('maps individual items with their prices', () => {
    expect(buildInsertItems([item, variantItem], [])).toEqual([
      { productId: 1, productName: 'Beef Strips', price: 95, quantity: 2, variantId: undefined, variantName: undefined },
      { productId: 2, productName: 'Jerky', price: 80, quantity: 1, variantId: 7, variantName: 'Chicken' },
    ]);
  });

  it('records bundle component items at price 0 and lists them first', () => {
    const result = buildInsertItems([item], [bundle]);
    expect(result).toEqual([
      { productId: 4, productName: 'Salmon Cubes', price: 0, quantity: 1, variantId: undefined, variantName: undefined },
      { productId: 5, productName: 'Yogurt Cubes', price: 0, quantity: 2, variantId: undefined, variantName: undefined },
      { productId: 1, productName: 'Beef Strips', price: 95, quantity: 2, variantId: undefined, variantName: undefined },
    ]);
  });

  it('returns an empty array for an empty cart', () => {
    expect(buildInsertItems([], [])).toEqual([]);
  });
});
