import type { CartItem, CartBundle } from '../context/CartContext';

export type InsertItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};

/**
 * Flattens the cart (individual items + bundles) into transaction line items,
 * mirroring the payment modal so history and reports stay consistent. Bundle
 * component items are recorded at price 0 because the bundle price is the total.
 */
export function buildInsertItems(items: CartItem[], bundles: CartBundle[]): InsertItem[] {
  const bundleInsertItems: InsertItem[] = bundles.flatMap((b) =>
    b.items.map((i) => ({
      productId: i.id,
      productName: i.name,
      price: 0,
      quantity: i.quantity,
      variantId: i.variantId,
      variantName: i.variantName,
    }))
  );
  const individualInsertItems: InsertItem[] = items.map((i) => ({
    productId: i.productId,
    productName: i.productName,
    price: i.price,
    quantity: i.quantity,
    variantId: i.variantId,
    variantName: i.variantName,
  }));
  return [...bundleInsertItems, ...individualInsertItems];
}
